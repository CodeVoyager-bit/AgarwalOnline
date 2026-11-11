import { ReceiptText } from "lucide-react";
import { billNumber } from "@/lib/commerce/bill";
import { AGARWAL, orderBillList, sellerOf } from "@/lib/commerce/bill-split";
import { formatPrice } from "@/lib/display";
import { BillActions } from "./bill-actions";

export type BillsOrder = {
  _id: unknown;
  number: string;
  orderStatus: string;
  deliveryPaise?: number | null;
  promotionDiscountPaise?: number | null;
  items: { linePaise: number; billedBy?: unknown; providerName?: string | null }[];
  providerBills?: { providerId: unknown; number: string; issuedAt?: Date | null; seller?: { legalName?: string | null } | null }[] | null;
  bill?: { revision?: number | null; seller?: { legalName?: string | null } | null } | null;
};

/** Each bill's seller: Agarwal's name as on its bill, or the provider's. */
function titleOf(order: BillsOrder, key: string, sellerName: string | null, shopName: string) {
  if (key === AGARWAL) return order.bill?.seller?.legalName || shopName;
  return sellerName ?? order.items.find((line) => sellerOf(line) === key)?.providerName ?? "Provider";
}

/**
 * An order's bills, one row each, with Print bill and Share PDF on WhatsApp: Agarwal's own, and the bill of
 * each provider that bills its items in its own name (given at delivery). Staff also get the kaccha bill
 * before delivery, and their Share opens the customer's own WhatsApp on a computer.
 */
export function OrderBills({
  order,
  shopName,
  phone,
  estimate = false,
}: {
  order: BillsOrder;
  shopName: string;
  /** Staff: the customer's number, so WhatsApp opens on their chat. */
  phone?: string;
  /** Staff before delivery: the kaccha bill too. */
  estimate?: boolean;
}) {
  if (order.orderStatus === "cancelled") return null;
  const id = String(order._id);
  return (
    <ul className="order-bills" id="bills">
      {orderBillList(order).map((entry) => {
        const title = titleOf(order, entry.key, entry.sellerName, shopName);
        const number = entry.key === AGARWAL ? billNumber(order) : entry.number;
        return (
          <li key={entry.key}>
            <span className="order-bill-head">
              <ReceiptText size={18} aria-hidden="true" />
              <span>
                <strong>{title}</strong>
                <small>
                  {number ? `Bill ${number} · ` : ""}
                  {formatPrice(entry.totalPaise)}
                  {entry.key !== AGARWAL && " · its own bill"}
                </small>
              </span>
            </span>
            {entry.issued ? (
              <BillActions orderId={id} orderNumber={order.number} bills={[{ key: entry.key }]} phone={phone} />
            ) : (
              <small className="muted">{title}’s bill, in its own name, comes with the delivery.</small>
            )}
          </li>
        );
      })}
      {estimate && (
        <li>
          <span className="order-bill-head">
            <ReceiptText size={18} aria-hidden="true" />
            <span>
              <strong>Kaccha bill</strong>
              <small>An estimate of the whole order, not a bill</small>
            </span>
          </span>
          <BillActions orderId={id} orderNumber={order.number} bills={[{ key: AGARWAL }]} estimate phone={phone} />
        </li>
      )}
    </ul>
  );
}
