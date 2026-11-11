import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { customerStage, formatIst, formatPrice, type OrderStatusFields } from "@/lib/display";
import { orderBillList } from "@/lib/commerce/bill-split";
import { StatusPill } from "./status-pill";
import { BillActions } from "./bill-actions";

export type HistoryOrder = OrderStatusFields & {
  _id: unknown;
  number: string;
  createdAt: Date;
  totalPaise: number;
  items: { quantity: number; linePaise: number; billedBy?: unknown }[];
  deliveryPaise?: number | null;
  promotionDiscountPaise?: number | null;
  providerBills?: { providerId: unknown; number: string; issuedAt?: Date | null }[] | null;
};

/**
 * A customer's orders, newest first: number, when it was placed, how many items, where it stands in
 * plain words and the total, and once delivered Print and Share PDF on WhatsApp for its bills. Used on
 * "Your orders" and, shortened, on the account page.
 */
export function OrderHistory({ orders, mr = false }: { orders: HistoryOrder[]; mr?: boolean }) {
  return (
    <ul className="order-history">
      {orders.map((order) => {
        const stage = customerStage(order, mr ? "mr" : "en");
        const items = order.items.reduce((sum, item) => sum + item.quantity, 0);
        // every bill the order has, issued at delivery (a provider that bills in its own name adds one)
        const bills = orderBillList(order).filter((bill) => bill.issued);
        const delivered = order.deliveryStatus === "delivered" && order.orderStatus !== "cancelled";
        return (
          <li key={String(order._id)} className={delivered ? "has-bills" : undefined}>
            <Link href={`/account/orders/${order._id}`} className="panel order-history-row">
              <span className="order-history-main">
                <strong>{order.number}</strong>
                <small>
                  {formatIst(order.createdAt, { dateStyle: "medium" })} ·{" "}
                  {mr ? `${items} वस्तू` : `${items} item${items === 1 ? "" : "s"}`}
                </small>
              </span>
              <StatusPill tone={stage.tone}>{stage.label}</StatusPill>
              <strong className="order-history-total">{formatPrice(order.totalPaise)}</strong>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
            {delivered && bills.length > 0 && (
              <BillActions
                orderId={String(order._id)}
                orderNumber={order.number}
                bills={bills.map((bill) => ({ key: bill.key }))}
                compact
                printHref={`/account/orders/${order._id}#bills`}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
