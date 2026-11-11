/*
 * One order, one bill per seller. Agarwal bills its own items and the delivery; a provider that bills
 * in its own name (Providers → Tax and billing) gets its own bill for its items, numbered in its own
 * series. No database here, so the rules can be tested on their own (provider-bills.ts issues them,
 * src/lib/documents/order-bills.ts draws them).
 */

/** The key of Agarwal's own bill; a provider's bill is keyed by the provider's id. */
export const AGARWAL = "agarwal";

type Line = { linePaise: number; billedBy?: unknown };
type ProviderBill = { providerId: unknown; number: string; issuedAt?: Date | string | null; seller?: { legalName?: string | null } | null };
type SplitOrder = {
  items: Line[];
  deliveryPaise?: number | null;
  totalPaise?: number | null;
  providerBills?: ProviderBill[] | null;
  bill?: { revision?: number | null } | null;
};

/** Who bills a line: a provider's id, or Agarwal. */
export const sellerOf = (line: { billedBy?: unknown }) => (line.billedBy ? String(line.billedBy) : AGARWAL);

/** "26-27" for any day from 1 April 2026 to 31 March 2027, in India's time. */
export function financialYear(at: Date) {
  const ist = new Date(at.getTime() + 5.5 * 3600 * 1000);
  const start = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Up to three capital letters before a provider's bill numbers: "KT" gives "KT/26-27/0001". */
export const BILL_PREFIX_RE = /^[A-Z]{1,3}$/;

/**
 * A provider's bill number: its prefix, the financial year and a count that starts again each year,
 * with "R1", "R2" after a re-issue, as Agarwal's own bills get. At most 16 characters, as the law asks.
 */
export function providerBillNumber(prefix: string, year: string, count: number, revision = 0) {
  const number = `${prefix}/${year}/${String(count).padStart(4, "0")}${revision > 0 ? `R${revision}` : ""}`;
  if (number.length > 16) throw Error(`The bill number ${number} is longer than the 16 characters a bill may have.`);
  return number;
}

/**
 * The order's coupon shared out over its bills by what each bill's items come to, so the shares add
 * up to the paisa (the largest remainders get the odd paise). A bill can't get more than its items.
 */
export function shareDiscount(discountPaise: number, values: number[]) {
  const gross = values.reduce((sum, value) => sum + value, 0);
  const discount = Math.min(Math.max(0, discountPaise), gross);
  if (!discount) return values.map(() => 0);
  const exact = values.map((value) => (discount * value) / gross);
  const shares = exact.map(Math.floor);
  let left = discount - shares.reduce((sum, share) => sum + share, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (!left) break;
    shares[index] += 1;
    left -= 1;
  }
  return shares;
}

/** Whether some of the order's items are billed by a provider in its own name. */
export const isSplit = (order: Pick<SplitOrder, "items">) => order.items.some((line) => sellerOf(line) !== AGARWAL);

/**
 * The order's bills, Agarwal's first. Agarwal's is there for its own items or a delivery fee (or when
 * there is nothing else); a provider's appears for its items, with its number once it is issued at
 * delivery. `totalPaise` is what that bill comes to after its share of the coupon.
 */
export function orderBillList(order: SplitOrder & { promotionDiscountPaise?: number | null }) {
  const keys = [...new Set(order.items.map(sellerOf))];
  const providers = keys.filter((key) => key !== AGARWAL);
  const ownValue = order.items.filter((line) => sellerOf(line) === AGARWAL).reduce((sum, line) => sum + line.linePaise, 0);
  const agarwal = ownValue > 0 || (order.deliveryPaise ?? 0) > 0 || !providers.length || keys.includes(AGARWAL);
  const groups = [...(agarwal ? [AGARWAL] : []), ...providers];
  const values = groups.map((key) => order.items.filter((line) => sellerOf(line) === key).reduce((sum, line) => sum + line.linePaise, 0));
  const shares = shareDiscount(order.promotionDiscountPaise ?? 0, values);
  return groups.map((key, index) => {
    const issued = key === AGARWAL ? null : (order.providerBills ?? []).find((bill) => String(bill.providerId) === key);
    const delivery = key === AGARWAL ? (order.deliveryPaise ?? 0) : 0;
    return {
      key,
      /** The provider's bill number once issued, with the order's re-issue mark; Agarwal's comes from billNumber(). */
      number: issued ? withRevision(issued.number, order.bill?.revision ?? 0) : null,
      issued: key === AGARWAL || Boolean(issued?.issuedAt),
      sellerName: issued?.seller?.legalName ?? null,
      itemsPaise: values[index],
      discountPaise: shares[index],
      deliveryPaise: delivery,
      totalPaise: values[index] - shares[index] + delivery,
    };
  });
}

/** A re-issued order (a new name on the bill) re-issues every bill on it: "KT/26-27/0001R1". */
export function withRevision(number: string, revision: number) {
  const base = number.replace(/R\d+$/, "");
  return revision > 0 ? `${base}R${revision}` : base;
}

/** The PDF's file name: "Agarwal-bill-20261107-00012.pdf", "Kale-Toys-bill-KT-26-27-0001.pdf". */
export function billFileName(seller: string, number: string) {
  const clean = (text: string) =>
    text
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  return `${clean(seller) || "Bill"}-bill-${clean(number) || "draft"}.pdf`;
}
