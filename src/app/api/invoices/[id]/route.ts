import { currentUser } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { objectId } from "@/lib/commerce/service";

function escape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return new Response("Authentication required", { status: 401 });
  const { id } = await params;
  if (!objectId.safeParse(id).success)
    return new Response("Invoice not found", { status: 404 });
  const order = await Order.findOne({
    _id: id,
    ...(user.role === "customer" ? { customerId: user.id } : {}),
  });
  if (!order || user.role === "delivery")
    return new Response("Invoice not found", { status: 404 });
  const rows = order.items
    .map(
      (item: {
        name: string;
        label: string;
        quantity: number;
        pricePaise: number;
        linePaise: number;
      }) =>
        `<tr><td>${escape(item.name)}<small>${escape(item.label)}</small></td><td>${item.quantity}</td><td>₹${(item.pricePaise / 100).toFixed(2)}</td><td>₹${(item.linePaise / 100).toFixed(2)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(order.number)} invoice</title><style>body{font:15px Arial;color:#0f172a;max-width:760px;margin:48px auto;padding:0 24px}header{display:flex;justify-content:space-between;border-bottom:3px solid #1e3a8a;padding-bottom:22px}h1{font-size:24px;margin:0}.muted,small{display:block;color:#5b6472;margin-top:4px}table{width:100%;border-collapse:collapse;margin:32px 0}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #e5e8ee}th:last-child,td:last-child{text-align:right}.totals{margin-left:auto;width:300px}.totals p{display:flex;justify-content:space-between}.grand{font-size:20px;font-weight:700;border-top:2px solid #0f172a;padding-top:12px}@media print{body{margin:20px auto}}</style></head><body><header><div><h1>AGARWAL GENERAL STORES</h1><span class="muted">Everything You Need, Delivered to Your Doorstep</span></div><div><strong>Order invoice</strong><span class="muted">${escape(order.number)}</span></div></header><p><strong>Deliver to:</strong><br>${escape(order.address.name)}<br>${escape(order.address.line)}, ${escape(order.address.areaName)} ${escape(order.address.pin)}</p><p class="muted">Ordered ${new Date(order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · ${escape(order.paymentMethod.toUpperCase())} · ${escape(order.paymentStatus)}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><p><span>Subtotal</span><strong>₹${(order.subtotalPaise / 100).toFixed(2)}</strong></p><p><span>Delivery</span><strong>₹${(order.deliveryPaise / 100).toFixed(2)}</strong></p><p class="grand"><span>Total</span><span>₹${(order.totalPaise / 100).toFixed(2)}</span></p></div><p class="muted">Computer-generated order invoice. Tax details are not shown because GST configuration has not been supplied.</p></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${order.number}-invoice.html"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
