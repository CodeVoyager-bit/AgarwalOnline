import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, Category, InventoryItem, Product, ProductVariant, User } from "../src/lib/db/models";
import { Order, SystemSetting } from "../src/lib/commerce/models";
import { LOW_STOCK, lowStockRows, saveReportHour, sendLowStockReport } from "../src/lib/inventory/low-stock";
import { setAlertLevel, setPackCost } from "../src/lib/catalog/manage";
import { profitReport } from "../src/lib/analytics/service";

const uri = process.env.TEST_MONGODB_URI;
/** Emails handed to the shop mailbox (only the SMTP server is faked). */
const sentMail: { to: string; subject: string; attachments?: { filename: string; content: Buffer }[] }[] = [];

describe.skipIf(!uri)("Stock alerts, the owners' low-stock email and purchase prices", () => {
  let admin: string, owner: string;
  const pack = (sku: string) => ProductVariant.findOne({ sku });

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
      SMTP_USER: "orders@example.test",
      SMTP_PASS: "test-mailbox-password",
      EMAIL_FROM: "Agarwal General Stores <orders@example.test>",
    });
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: async (mail: (typeof sentMail)[number]) => sentMail.push(mail),
    } as never);
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, InventoryItem, AuditLog, SystemSetting, Order]) await model.init();
  });
  beforeEach(async () => {
    sentMail.length = 0;
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    admin = String((await User.create({ name: "Staff", phone: "9000000501", roles: ["customer", "admin"] }))._id);
    owner = String(
      (await User.create({ name: "Owner", phone: "9000000502", roles: ["customer", "super-admin"], email: "owner@example.test", emailVerified: true }))._id,
    );
    const category = await Category.create({ slug: "pens", name: { en: "Pens", mr: "पेन" } });
    const product = await Product.create({
      slug: "ball-pen",
      name: { en: "Ball Pen", mr: "बॉल पेन" },
      description: { en: "Pen", mr: "पेन" },
      categoryId: category._id,
      categorySlug: "pens",
      status: "published",
    });
    // [sku, on the shelf, alert below]: default 10, a higher level, plenty, and alerts switched off
    for (const [sku, onHand, alertBelow] of [
      ["PEN-1", 3, undefined],
      ["PEN-2", 20, 25],
      ["PEN-3", 50, undefined],
      ["PEN-4", 0, 0],
    ] as const) {
      const variant = await ProductVariant.create({ productId: product._id, sku, label: sku, unit: "piece", packQuantity: 1, pricePaise: 1000, mrpPaise: 1000 });
      await InventoryItem.create({ variantId: variant._id, onHand, ...(alertBelow !== undefined ? { alertBelow } : {}) });
    }
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("counts a pack as low by its own alert level; 0 never warns", async () => {
    expect(await InventoryItem.countDocuments(LOW_STOCK)).toBe(2);
    expect((await lowStockRows()).map((row) => row.sku)).toEqual(["PEN-1", "PEN-2"]);
    await setAlertLevel(admin, { variantId: String((await pack("PEN-3"))!._id), alertBelow: "60" });
    expect(await InventoryItem.countDocuments(LOW_STOCK)).toBe(3);
    // a blank box goes back to the default
    await setAlertLevel(admin, { variantId: String((await pack("PEN-3"))!._id), alertBelow: "" });
    expect(await InventoryItem.countDocuments(LOW_STOCK)).toBe(2);
  });

  it("keeps purchase prices to owners and out of every ordinary read", async () => {
    const id = String((await pack("PEN-1"))!._id);
    await expect(setPackCost(admin, { variantId: id, costPaise: "600" })).rejects.toThrow("FORBIDDEN");
    await setPackCost(owner, { variantId: id, costPaise: "600" });
    expect((await ProductVariant.findById(id))!.costPaise).toBeUndefined();
    expect((await ProductVariant.findById(id).lean<{ costPaise?: number }>())!.costPaise).toBeUndefined();
    expect((await ProductVariant.findById(id).select("+costPaise"))!.costPaise).toBe(600);
    expect((await lowStockRows())[0]).not.toHaveProperty("costPaise");
    expect((await lowStockRows({ withCost: true }))[0].costPaise).toBe(600);
    expect(await AuditLog.countDocuments({ action: "variant.cost" })).toBe(1);
  });

  it("emails the owners once a day, at or after their hour, with the Excel file", async () => {
    await saveReportHour(21);
    // 20:30 in India: too early
    expect(await sendLowStockReport({ now: new Date("2026-10-14T15:00:00Z") })).toEqual({ sent: 0, low: null });
    // 21:10 in India: sent, with the file
    expect(await sendLowStockReport({ now: new Date("2026-10-14T15:40:00Z") })).toEqual({ sent: 1, low: 2 });
    expect(sentMail[0].to).toBe("owner@example.test");
    expect(sentMail[0].subject).toContain("2 packs need reordering");
    expect(sentMail[0].attachments?.[0].filename).toBe("Low stock 2026-10-14.xlsx");
    expect(sentMail[0].attachments?.[0].content.subarray(0, 2).toString()).toBe("PK");
    // the next hourly check the same day sends nothing more
    expect((await sendLowStockReport({ now: new Date("2026-10-14T16:40:00Z") })).sent).toBe(0);
    expect(sentMail).toHaveLength(1);
    // switched off: nothing, until an owner asks for it now
    await saveReportHour(null);
    expect((await sendLowStockReport({ now: new Date("2026-10-15T15:40:00Z") })).sent).toBe(0);
    expect((await sendLowStockReport({ force: true })).sent).toBe(1);
  });

  it("sends nothing on a day when nothing is low", async () => {
    await InventoryItem.updateMany({}, { $set: { onHand: 500 } });
    await saveReportHour(9);
    expect(await sendLowStockReport({ now: new Date("2026-10-14T05:00:00Z") })).toEqual({ sent: 0, low: 0 });
    expect(sentMail).toHaveLength(0);
  });

  it("works out profit for owners from purchase prices, discounts off", async () => {
    const [one, two] = [await pack("PEN-1"), await pack("PEN-2")];
    await setPackCost(owner, { variantId: String(one!._id), costPaise: "600" });
    const line = (variant: typeof one, quantity: number) => ({
      variantId: variant!._id,
      name: "Ball Pen",
      label: variant!.label,
      quantity,
      pricePaise: 1000,
      linePaise: 1000 * quantity,
    });
    const order = { customerId: new mongoose.Types.ObjectId(), address: { name: "A", phone: "9000000000", line: "x", pin: "402106" } };
    await Order.collection.insertMany([
      { ...order, number: "T-1", idempotencyKey: "t-1", items: [line(one, 3), line(two, 1)], promotionDiscountPaise: 400, orderStatus: "placed", createdAt: new Date() },
      { ...order, number: "T-2", idempotencyKey: "t-2", items: [line(one, 5)], orderStatus: "cancelled", createdAt: new Date() },
    ]);
    await expect(profitReport(admin, {})).rejects.toThrow("FORBIDDEN");
    const { rows, totals } = await profitReport(owner, {});
    // the cancelled order doesn't count; PEN-2 has no purchase price yet
    expect(rows.find((row) => row.label === "PEN-1")).toMatchObject({ quantity: 3, revenuePaise: 3000, costPaise: 1800, profitPaise: 1200 });
    expect(rows.find((row) => row.label === "PEN-2")).toMatchObject({ quantity: 1, costPaise: null, profitPaise: null });
    // ₹4 of discount, shared out by takings: 3/4 of it falls on the priced pack
    expect(totals).toMatchObject({ revenuePaise: 4000, discountPaise: 400, costPaise: 1800, profitPaise: 900, unpriced: 1 });
  });
});
