import { z } from "zod";
import { inclusiveTax } from "../documents/invoice";
import { factsOf, lineFacts } from "../documents/line-facts";
import { xlsx } from "../xlsx";
import { orderBillList, sellerOf, withRevision } from "./bill-split";
import { Order } from "./models";

const rupees = (paise: number) => paise / 100;
const day = (date: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" }).format(date);

type Line = { variantId?: unknown; name: string; quantity: number; linePaise: number; billedBy?: unknown };
type ReportOrder = {
  number: string;
  address?: { name?: string };
  bill?: { name?: string; revision?: number | null } | null;
  items: Line[];
  deliveryPaise?: number;
  promotionDiscountPaise?: number;
  orderStatus: string;
  providerBills: { providerId: unknown; number: string; issuedAt: Date; seller: { legalName: string; gstin?: string; registration?: string } }[];
};

/**
 * The bills providers gave in their own name in a month, for the CA: every bill with its taxable value and
 * GST, and one line a provider with the month's total (an e-commerce operator's TCS return is worked out on
 * those sales). The GST is worked out as on the bills themselves (inclusiveTax, with the coupon shared out).
 */
export async function providerBillsFile(params: URLSearchParams) {
  const { month } = z
    .object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() })
    .catch({})
    .parse(Object.fromEntries(params));
  const [year, monthIndex] = (month ?? new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7)).split("-").map(Number);
  const start = new Date(`${year}-${String(monthIndex).padStart(2, "0")}-01T00:00:00+05:30`);
  const end = new Date(Date.UTC(year, monthIndex, 1) - 5.5 * 3600 * 1000);
  const orders = await Order.find({ "providerBills.issuedAt": { $gte: start, $lt: end } })
    .sort({ "providerBills.issuedAt": 1 })
    .select("number address bill items deliveryPaise promotionDiscountPaise orderStatus providerBills")
    .lean<ReportOrder[]>()
    .limit(20000);
  const facts = await lineFacts(orders.flatMap((order) => order.items));
  const rows: (string | number)[][] = [];
  const totals = new Map<string, { name: string; gstin: string; bills: number; taxable: number; tax: number; total: number }>();
  for (const order of orders) {
    const entries = orderBillList(order);
    for (const bill of order.providerBills) {
      if (bill.issuedAt < start || bill.issuedAt >= end) continue;
      const key = String(bill.providerId);
      const entry = entries.find((candidate) => candidate.key === key);
      if (!entry) continue;
      const lines = order.items.filter((line) => sellerOf(line) === key);
      const composition = bill.seller.registration === "composition";
      const tax = composition
        ? null
        : inclusiveTax(
            lines.map((line) => ({ linePaise: line.linePaise, rate: factsOf(line, facts).gstRatePercent ?? null })),
            entry.discountPaise,
            0,
          );
      // every line's value before GST, those with no rate set counted as they are
      const taxable = tax ? tax.rows.reduce((sum, row) => sum + row.taxable, 0) : entry.totalPaise;
      const cgst = tax?.cgst ?? 0;
      const sgst = tax?.sgst ?? 0;
      rows.push([
        bill.seller.legalName,
        bill.seller.gstin ?? "",
        composition ? "Bill of supply" : "Tax invoice",
        withRevision(bill.number, order.bill?.revision ?? 0),
        day(bill.issuedAt),
        order.number,
        order.bill?.name || order.address?.name || "",
        rupees(taxable),
        rupees(cgst),
        rupees(sgst),
        rupees(entry.totalPaise),
        order.orderStatus,
      ]);
      const sum = totals.get(key) ?? { name: bill.seller.legalName, gstin: bill.seller.gstin ?? "", bills: 0, taxable: 0, tax: 0, total: 0 };
      totals.set(key, {
        ...sum,
        bills: sum.bills + 1,
        taxable: sum.taxable + taxable,
        tax: sum.tax + cgst + sgst,
        total: sum.total + entry.totalPaise,
      });
    }
  }
  return xlsx([
    {
      name: "By provider",
      rows: [
        ["Provider", "GSTIN", "Bills", "Taxable value (₹)", "GST (₹)", "Total (₹)"],
        ...[...totals.values()].map((sum) => [sum.name, sum.gstin, sum.bills, rupees(sum.taxable), rupees(sum.tax), rupees(sum.total)]),
      ],
    },
    {
      name: "Bills",
      rows: [
        ["Provider", "GSTIN", "Kind", "Bill no.", "Date", "Order", "Customer", "Taxable value (₹)", "CGST (₹)", "SGST (₹)", "Total (₹)", "Order status"],
        ...rows,
      ],
    },
  ]);
}
