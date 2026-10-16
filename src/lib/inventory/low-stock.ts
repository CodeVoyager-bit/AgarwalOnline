import { z } from "zod";
import { connectDB } from "../db/connect";
import { InventoryItem, Product, ProductVariant, User } from "../db/models";
import { SystemSetting } from "../commerce/models";
import { isPlaceholderEmail, sendEmail } from "../email/send";
import { lowStockEmail } from "../email/templates";
import { log } from "../logger";
import { xlsx, xlsxName, type Cell } from "../xlsx";

/** Packs without their own alert level count as running low below this many. */
export const DEFAULT_ALERT_BELOW = 10;

/** Stock records running low: fewer can be sold than the pack's alert level. 0 never warns. */
export const LOW_STOCK = {
  $expr: { $lt: [{ $subtract: ["$onHand", "$reserved"] }, { $ifNull: ["$alertBelow", DEFAULT_ALERT_BELOW] }] },
};
export const isLow = (available: number, alertBelow?: number | null) => available < (alertBelow ?? DEFAULT_ALERT_BELOW);

export type LowStockRow = {
  product: string;
  pack: string;
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  alertBelow: number;
  /** Owners only. */
  costPaise?: number;
};

/** Every pack running low, emptiest first. With costs for the owners' copy. */
export async function lowStockRows({ withCost = false } = {}): Promise<LowStockRow[]> {
  await connectDB();
  const stock = await InventoryItem.find(LOW_STOCK).select("variantId onHand reserved alertBelow").lean<
    { variantId: unknown; onHand: number; reserved: number; alertBelow?: number }[]
  >();
  const variants = await ProductVariant.find({ _id: { $in: stock.map((item) => item.variantId) }, active: { $ne: false } })
    .select(`productId label sku${withCost ? " +costPaise" : ""}`)
    .lean<{ _id: unknown; productId: unknown; label: string; sku: string; costPaise?: number }[]>();
  const products = await Product.find({ _id: { $in: variants.map((v) => v.productId) } })
    .select("name")
    .lean<{ _id: unknown; name: { en: string } }[]>();
  const byId = new Map(variants.map((v) => [String(v._id), v]));
  const names = new Map(products.map((p) => [String(p._id), p.name.en]));
  return stock
    .flatMap((item) => {
      const v = byId.get(String(item.variantId));
      if (!v) return [];
      return [
        {
          product: names.get(String(v.productId)) ?? "Unknown product",
          pack: v.label,
          sku: v.sku,
          onHand: item.onHand,
          reserved: item.reserved,
          available: Math.max(0, item.onHand - item.reserved),
          alertBelow: item.alertBelow ?? DEFAULT_ALERT_BELOW,
          ...(withCost && v.costPaise != null ? { costPaise: v.costPaise } : {}),
        },
      ];
    })
    .sort((a, b) => a.available - b.available || a.product.localeCompare(b.product));
}

/** The report as an Excel file: what to reorder, and, for owners, what it costs at the last purchase price. */
export function lowStockWorkbook(rows: LowStockRow[], withCost = false) {
  const header: Cell[] = ["Product", "Pack", "SKU", "Can be sold", "On the shelf", "Held for orders", "Alert below", "To reach the alert level"];
  if (withCost) header.push("Purchase price (₹)", "Cost to reach the alert level (₹)");
  return xlsx([
    {
      name: "Low stock",
      rows: [
        header,
        ...rows.map((row) => {
          const need = Math.max(0, row.alertBelow - row.available);
          const cells: Cell[] = [row.product, row.pack, row.sku, row.available, row.onHand, row.reserved, row.alertBelow, need];
          if (withCost) cells.push(row.costPaise != null ? row.costPaise / 100 : null, row.costPaise != null ? (need * row.costPaise) / 100 : null);
          return cells;
        }),
      ],
    },
  ]);
}

const KEY = "low-stock-report";
/** When the owners get the report: an hour of the day in India (0–23), or off. */
const reportSetting = z.object({ hour: z.number().int().min(0).max(23).nullable(), lastSent: z.string().optional() });
export type ReportSetting = z.infer<typeof reportSetting>;
/** The end of the day, unless an owner picks another hour or turns it off. */
export const DEFAULT_REPORT_HOUR = 21;

export async function reportSettings(): Promise<ReportSetting> {
  await connectDB();
  const row = await SystemSetting.findOne({ key: KEY }).lean<{ value?: unknown }>();
  return reportSetting.catch({ hour: DEFAULT_REPORT_HOUR }).parse(row?.value ?? { hour: DEFAULT_REPORT_HOUR });
}
export async function saveReportHour(hour: number | null) {
  const current = await reportSettings();
  await SystemSetting.updateOne({ key: KEY }, { $set: { value: { ...current, hour } } }, { upsert: true });
}

/** "9 PM", "12 AM": how the settings and messages show a report hour. */
export const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;

const istDay = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
const istHour = (now: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(now));

/**
 * Emails the owners the low-stock report. The scheduled check calls this every hour; it sends once a
 * day, at or after the owners' hour, and only when something is running low. `now` sends straight
 * away (the "Send it now" button), even when nothing is low, so the owners can see it works.
 */
export async function sendLowStockReport({ now = new Date(), force = false } = {}) {
  const settings = await reportSettings();
  const today = istDay(now);
  if (!force && (settings.hour === null || istHour(now) < settings.hour || settings.lastSent === today))
    return { sent: 0, low: null as number | null };
  const rows = await lowStockRows({ withCost: true });
  const done = () => SystemSetting.updateOne({ key: KEY }, { $set: { value: { ...settings, lastSent: today } } }, { upsert: true });
  // nothing low: the day is done without an email
  if (!rows.length && !force) {
    await done();
    return { sent: 0, low: 0 };
  }
  const owners = (await User.find({ roles: "super-admin", active: true }).select("name email").lean<{ name?: string; email?: string }[]>()).filter(
    (owner) => !isPlaceholderEmail(owner.email),
  );
  const file = lowStockWorkbook(rows, true);
  let sent = 0;
  for (const owner of owners) {
    try {
      await sendEmail({
        to: owner.email!,
        ...lowStockEmail({ name: owner.name ?? "", rows, day: today }),
        attachments: [{ filename: xlsxName("Low stock", now), content: Buffer.from(file) }],
      });
      sent += 1;
    } catch (error) {
      log("warn", "stock-report.send-failed", { error });
    }
  }
  // a failed send is tried again at the next hourly check
  if (!force && (sent > 0 || !owners.length)) await done();
  return { sent, low: rows.length };
}
