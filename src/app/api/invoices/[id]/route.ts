import { orderBillHtml } from "@/lib/documents/order-bills";
import { billAccess, billBarFor, billKeyOf, billQuery, plainText } from "@/lib/documents/bill-request";

/**
 * One of an order's bills as a page: Agarwal's own (a cash memo, or a tax invoice once the shop has a
 * GSTIN; see renderInvoice), or with ?bill=<provider id> a provider's own bill, once issued at delivery.
 * With ?kind=estimate, staff get a kaccha bill instead: the same lines before delivery, marked as not a
 * bill. ?print=1 prints it on opening; ?code= opens it through the order's view-only bill link. When
 * Customize → Bills says bills download, it sends the PDF instead, unless ?view=1 (Print bill asks for the page).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const access = await billAccess(request, id);
  if ("error" in access) return access.error;
  const { order, staff } = access;
  const url = new URL(request.url);
  const key = billKeyOf(request);
  if (!key) return plainText("Bill not found", 404);
  const estimate = url.searchParams.get("kind") === "estimate";
  if (estimate) {
    if (!staff) return plainText("Only the store can make an estimate.", 403);
    if (order.orderStatus === "cancelled") return plainText("A cancelled order has no estimate.", 409);
    if (order.deliveryStatus === "delivered" || order.bill?.issuedAt)
      return plainText("This order is delivered: its bill is the one to give.", 409);
  }
  const bill = await orderBillHtml(order, {
    key,
    estimate,
    staffView: staff,
    bar: billBarFor(access, { key, estimate, autoPrint: url.searchParams.get("print") === "1" }),
  });
  if (!bill) return plainText("Bill not found", 404);
  if (bill.openAs === "download" && url.searchParams.get("view") !== "1") {
    const query = billQuery({ key, estimate, code: access.code });
    return Response.redirect(new URL(`/api/invoices/${id}/pdf${query ? `?${query}` : ""}`, request.url), 307);
  }
  return new Response(bill.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
