import { shortfallRefund } from "../operations/packing";
import { Refund } from "../payments/models";
import { taxProfile } from "../tax/profile";
import { GST_STATES } from "../tax/gst";
import { billNumber, previousBillNumber } from "../commerce/bill";
import { AGARWAL, billFileName, isSplit, orderBillList, sellerOf, withRevision } from "../commerce/bill-split";
import { shopSettings } from "../settings/shop";
import { getEnv } from "../env";
import { renderInvoice, type InvoiceLine, type InvoiceOrder, type LineFacts } from "./invoice";
import { factsOf, lineFacts } from "./line-facts";
import type { BillBar } from "./bill-bar";

type OrderDoc = {
  _id: unknown;
  number: string;
  shortfallPaise?: number | null;
  bill?: { issuedAt?: Date | null; revision?: number | null; seller?: { legalName?: string; address?: string; phone?: string; gstin?: string } | null } | null;
  createdAt: Date;
  items: unknown[];
  toObject(): unknown;
};
type ProviderSeller = { legalName: string; address?: string; gstin?: string; stateCode?: string; registration?: string; style?: string };
type PlainOrder = Omit<InvoiceOrder, "items" | "bill"> & {
  items: (InvoiceLine & { billedBy?: unknown; providerName?: string })[];
  providerBills?: { providerId: unknown; number: string; issuedAt: Date; seller: ProviderSeller }[];
  bill?: (InvoiceOrder["bill"] & { revision?: number | null; issuedAt?: Date | null }) | null;
};

/** What a line was printed at before the shop's own discount, times the quantity: the line's MRP saving. */
const savingsOf = (lines: InvoiceLine[], facts: Map<string, LineFacts>) =>
  lines.reduce((sum, line) => {
    const mrp = factsOf(line, facts).mrpPaise;
    return sum + (mrp && mrp > line.pricePaise ? (mrp - line.pricePaise) * line.quantity : 0);
  }, 0);

/**
 * One of an order's bills as a whole HTML page: Agarwal's own (the default, with the delivery), or a
 * provider's own bill by its id, once issued at delivery. A kaccha bill (`estimate`) always covers the whole
 * order, since it isn't a bill. Returns null for a bill this order doesn't have.
 */
export async function orderBillHtml(
  order: OrderDoc,
  {
    key = AGARWAL,
    estimate = false,
    staffView = false,
    bar,
  }: {
    key?: string;
    estimate?: boolean;
    staffView?: boolean;
    /** The buttons at the top, given the bill's number and file name; none for a PDF. */
    bar?: (meta: { number: string; fileName: string; sellerName: string }) => BillBar | null;
  },
) {
  const plain = order.toObject() as PlainOrder;
  const [shop, bill, facts, pay] = await Promise.all([
    taxProfile(),
    shopSettings("bill"),
    lineFacts(plain.items),
    shopSettings("quotation"),
  ]);
  const origin = getEnv().APP_ORIGIN;
  const split = !estimate && isSplit(plain);
  const entry = orderBillList(plain).find((candidate) => candidate.key === key);
  if (estimate ? key !== AGARWAL : !entry || !entry.issued) return null;
  // a bill already issued (at delivery) keeps the shop's details as they were then
  const kept = order.bill?.issuedAt && order.bill?.seller?.legalName ? order.bill.seller : null;
  const agarwal = {
    legalName: kept?.legalName ?? shop.legalName,
    address: kept ? kept.address : shop.address,
    phone: kept ? kept.phone : shop.phone,
    gstin: kept ? kept.gstin : shop.gstin,
    email: shop.email,
  };
  const stateOf = (code?: string) => {
    const state = GST_STATES.find((candidate) => candidate.code === code);
    return state ? `${state.name} (${state.code})` : (code ?? "");
  };
  const lines = split ? plain.items.filter((line) => sellerOf(line) === key) : plain.items;
  // with more than one bill, each carries only its own items, its share of the coupon, and Agarwal's the delivery
  const subset: InvoiceOrder = split && entry
    ? {
        ...plain,
        items: lines,
        subtotalPaise: entry.itemsPaise,
        promotionDiscountPaise: entry.discountPaise,
        deliveryPaise: entry.deliveryPaise,
        totalPaise: entry.totalPaise,
        merchandiseSavingsPaise: savingsOf(lines, facts),
        originalTotalPaise: null,
        shortfallPaise: key === AGARWAL ? plain.shortfallPaise : null,
      }
    : plain;

  if (key === AGARWAL) {
    // read only: where the refund for items that weren't packed stands (it is made on the Refunds page)
    const refund = shortfallRefund(
      order.shortfallPaise,
      order.shortfallPaise ? await Refund.find({ orderId: order._id }).select("amountPaise status") : [],
    );
    const number = estimate ? `EST-${order.number}` : billNumber(order);
    const elsewhere = split
      ? orderBillList(plain)
          .filter((other) => other.key !== AGARWAL)
          .map((other) =>
            other.number
              ? `${other.sellerName ?? "The provider"}’s items are on its own bill, no. ${other.number}.`
              : `${plain.items.find((line) => sellerOf(line) === other.key)?.providerName ?? "A provider"}’s items get a bill in its own name at delivery.`,
          )
      : [];
    const fileName = billFileName(agarwal.legalName, estimate ? `estimate-${order.number}` : number);
    const html = renderInvoice({
      order: subset,
      seller: agarwal,
      stateName: stateOf(shop.stateCode),
      number,
      replaces: estimate ? null : previousBillNumber(order),
      date: order.bill?.issuedAt ?? order.createdAt,
      bill,
      refund,
      facts,
      origin,
      estimate,
      staffView,
      extraNotes: elsewhere,
      // the bank and UPI details the owner keeps for school quotations, when Bills asks for them
      payment: { accountName: pay.accountName, bankName: pay.bankName, accountNumber: pay.accountNumber, ifsc: pay.ifsc, upiId: pay.upiId },
      bar: bar?.({ number, fileName, sellerName: agarwal.legalName }) ?? null,
    });
    return { html, number, fileName, sellerName: agarwal.legalName, openAs: bill.openAs };
  }

  // a provider's own bill: its name, GSTIN and number, its chosen style, and who it was sold through
  const issued = plain.providerBills?.find((candidate) => String(candidate.providerId) === key);
  if (!issued) return null;
  const seller = issued.seller;
  const revision = plain.bill?.revision ?? 0;
  const number = withRevision(issued.number, revision);
  const fileName = billFileName(seller.legalName, number);
  const style = seller.style && seller.style !== "same" ? seller.style : bill.style;
  const html = renderInvoice({
    order: subset,
    seller: { legalName: seller.legalName, address: seller.address, gstin: seller.gstin },
    stateName: stateOf(seller.stateCode ?? shop.stateCode),
    number,
    replaces: revision > 0 ? withRevision(issued.number, revision - 1) : null,
    date: issued.issuedAt,
    bill: { ...bill, style, showLogo: false, showBankDetails: false, terms: "", shopNameMr: "", showSignature: true },
    refund: null,
    facts,
    origin,
    staffView,
    composition: seller.registration === "composition",
    extraNotes: [
      `Sold through Agarwal Online (${agarwal.legalName}${agarwal.gstin ? `, GSTIN ${agarwal.gstin}` : ""}), which delivered it and collected the payment, order ${order.number}.`,
    ],
    bar: bar?.({ number, fileName, sellerName: seller.legalName }) ?? null,
  });
  return { html, number, fileName, sellerName: seller.legalName, openAs: bill.openAs };
}
