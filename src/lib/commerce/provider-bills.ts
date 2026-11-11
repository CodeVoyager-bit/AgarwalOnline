import type mongoose from "mongoose";
import { log } from "../logger";
import { Provider } from "../providers/models";
import { AGARWAL, financialYear, providerBillNumber, sellerOf } from "./bill-split";
import { Sequence } from "./models";

type IssuedBill = {
  providerId: unknown;
  number: string;
  issuedAt: Date;
  seller: { legalName: string; address?: string; gstin: string; stateCode?: string; registration: string; style?: string };
};
type DeliveredOrder = {
  _id: unknown;
  items: { billedBy?: unknown }[];
  providerBills?: { toObject?: () => unknown }[] | null;
};

/**
 * At delivery, next to Agarwal's own bill: one bill for each provider that bills its items in its own
 * name, numbered in that provider's series for the financial year, with its details copied on as they
 * are now (a later edit doesn't rewrite a bill already given). If a provider's details went missing
 * since the order was placed, its items go on Agarwal's bill instead, so no item is left without one.
 */
export async function issueProviderBills(order: DeliveredOrder, session: mongoose.ClientSession, at = new Date()) {
  const bills = (order.providerBills ?? []).map((bill) => (bill.toObject ? bill.toObject() : bill)) as IssuedBill[];
  const done = new Set(bills.map((bill) => String(bill.providerId)));
  const keys = [...new Set(order.items.map(sellerOf))].filter((key) => key !== AGARWAL && !done.has(key));
  const year = financialYear(at);
  for (const key of keys) {
    const provider = await Provider.findById(key).select("name billing").session(session);
    const billing = provider?.billing;
    const usable =
      billing?.legalName &&
      billing.gstin &&
      billing.prefix &&
      (billing.registration === "regular" || billing.registration === "composition");
    if (!usable) {
      for (const line of order.items) if (sellerOf(line) === key) line.billedBy = undefined;
      log("warn", "provider-bill.fallback", { orderId: String(order._id), providerId: key });
      continue;
    }
    const count = await Sequence.findOneAndUpdate(
      { key: `provider-bill:${key}:${year}` },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after", session },
    );
    bills.push({
      providerId: provider._id,
      number: providerBillNumber(billing.prefix, year, count.value),
      issuedAt: at,
      seller: {
        legalName: billing.legalName,
        address: billing.address,
        gstin: billing.gstin,
        stateCode: billing.stateCode,
        registration: billing.registration,
        style: billing.style,
      },
    });
  }
  return bills;
}
