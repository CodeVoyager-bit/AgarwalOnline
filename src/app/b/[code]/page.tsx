import { notFound } from "next/navigation";
import { Lock, ReceiptText } from "lucide-react";
import { connectDB } from "@/lib/db/connect";
import { Order } from "@/lib/commerce/models";
import { billNumber } from "@/lib/commerce/bill";
import { AGARWAL, orderBillList, sellerOf } from "@/lib/commerce/bill-split";
import { BILL_CODE_RE } from "@/lib/documents/bill-request";
import { formatIst, formatPrice } from "@/lib/display";
import { taxProfile } from "@/lib/tax/profile";
import { PageHeading } from "@/components/page-heading";
import { SharedBillActions } from "@/components/bill-actions";
export const metadata = { title: "Your bill", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * An order's view-only bill link, for whoever the customer or the store sends it to on WhatsApp: each of
 * the order's bills to view or save as a PDF, signed in or not. It shows the customer's name and address,
 * so the code is long and secret, and the store can make a new link that turns this one off.
 */
export default async function SharedBills({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!BILL_CODE_RE.test(code)) notFound();
  await connectDB();
  const order = await Order.findOne({ billShareToken: code });
  if (!order || order.orderStatus === "cancelled") notFound();
  const shop = await taxProfile();
  const bills = orderBillList(order).filter((bill) => bill.issued);
  const id = String(order._id);
  const query = (key: string, extra: Record<string, string> = {}) =>
    new URLSearchParams({ ...(key !== AGARWAL ? { bill: key } : {}), code, ...extra }).toString();
  return (
    <section className="page-container shared-bills">
      <PageHeading
        eyebrow={`Order ${order.number}`}
        title={bills.length > 1 ? "Your bills" : "Your bill"}
        lead={`${formatPrice(order.totalPaise)} · ${formatIst(order.bill?.issuedAt ?? order.createdAt, { dateStyle: "medium" })}`}
      />
      <ul className="order-bills">
        {bills.map((bill) => {
          const seller =
            bill.key === AGARWAL
              ? (order.bill?.seller?.legalName ?? shop.legalName)
              : (bill.sellerName ?? order.items.find((line: { billedBy?: unknown }) => sellerOf(line) === bill.key)?.providerName ?? "Provider");
          const number = bill.key === AGARWAL ? billNumber(order) : bill.number;
          return (
            <li key={bill.key}>
              <span className="order-bill-head">
                <ReceiptText size={18} aria-hidden="true" />
                <span>
                  <strong>{seller}</strong>
                  <small>
                    {number ? `Bill ${number} · ` : ""}
                    {formatPrice(bill.totalPaise)}
                  </small>
                </span>
              </span>
              {/* Download saves the PDF without leaving this page (a plain link to it left a blank page
                  behind in some phone browsers, and the bare error text when it failed) */}
              <SharedBillActions
                pdfUrl={`/api/invoices/${id}/pdf?${query(bill.key)}`}
                viewUrl={`/api/invoices/${id}?${query(bill.key, { view: "1" })}`}
                fileName={`Bill-${number || order.number}.pdf`}
              />
            </li>
          );
        })}
      </ul>
      <p className="muted shared-bills-note">
        <Lock size={15} aria-hidden="true" /> View only. Anyone with this link can see these bills, signed in or not, so share it
        only with the customer. The store can make a new link, which turns this one off.
      </p>
    </section>
  );
}
