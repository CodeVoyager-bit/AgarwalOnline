import { randomBytes } from "node:crypto";
import { currentUser } from "../auth/session";
import { hasPermission } from "../auth/permissions";
import { invoiceOrder } from "../family/service";
import { connectDB } from "../db/connect";
import { AuditLog } from "../db/models";
import { Order } from "../commerce/models";
import { objectId } from "../commerce/service";
import { AGARWAL } from "../commerce/bill-split";
import { getEnv } from "../env";
import type { BillBar } from "./bill-bar";

/*
 * Who may open an order's bills, shared by the bill page, its PDF and its link: the customer (or their
 * family), staff who manage orders, or anyone holding the order's view-only bill link (/b/<code>).
 */

export const BILL_CODE_RE = /^[A-Za-z0-9_-]{24}$/;
export const plainText = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

type Access = {
  order: Awaited<ReturnType<typeof invoiceOrder>> & {};
  staff: boolean;
  code: string | null;
  /** Who is asking, for the rate limit: the account, or the bill link. */
  who: string;
};

/** The order and how it was reached, or the response to send instead. */
export async function billAccess(request: Request, id: string): Promise<Access | { error: Response }> {
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    if (!BILL_CODE_RE.test(code) || !objectId.safeParse(id).success) return { error: plainText("Bill not found", 404) };
    await connectDB();
    const order = await Order.findOne({ _id: id, billShareToken: code });
    return order ? { order, staff: false, code, who: `link:${code}` } : { error: plainText("Bill not found", 404) };
  }
  const user = await currentUser();
  if (!user) return { error: plainText("Authentication required", 401) };
  // staff who manage orders may open any bill; everyone else their own, or their family's
  const order = await invoiceOrder(user, id);
  if (!order) return { error: plainText("Bill not found", 404) };
  return { order, staff: hasPermission(user.roles, "order:manage"), code: null, who: `user:${user.id}` };
}

/** Which of the order's bills: "agarwal" (Agarwal's own, the default) or a provider's id. */
export function billKeyOf(request: Request) {
  const key = new URL(request.url).searchParams.get("bill") ?? AGARWAL;
  return key === AGARWAL || /^[a-f\d]{24}$/i.test(key) ? key : null;
}

/** The query that names one bill, carried from the page to its PDF: "bill=…&kind=estimate&code=…". */
export function billQuery({ key, estimate, code }: { key: string; estimate: boolean; code: string | null }) {
  return new URLSearchParams({
    ...(key !== AGARWAL ? { bill: key } : {}),
    ...(estimate ? { kind: "estimate" } : {}),
    ...(code ? { code } : {}),
  }).toString();
}

/**
 * The buttons on a bill page: Print bill, and Share PDF on WhatsApp. Staff send to the customer's own
 * WhatsApp; a customer picks the chat. The message names the bill, the order and who it is from.
 */
export function billBarFor(
  access: Access,
  { key, estimate, autoPrint }: { key: string; estimate: boolean; autoPrint: boolean },
) {
  const id = String(access.order._id);
  const query = billQuery({ key, estimate, code: access.code });
  const phone = access.order.address?.phone;
  return (meta: { number: string; fileName: string; sellerName: string }): BillBar => ({
    autoPrint,
    share: {
      pdfUrl: `/api/invoices/${id}/pdf${query ? `?${query}` : ""}`,
      fileName: meta.fileName,
      text: estimate
        ? `Kaccha bill (estimate) for order ${access.order.number} from ${meta.sellerName}.`
        : `Bill ${meta.number} for order ${access.order.number} from ${meta.sellerName}.`,
      ...(access.code ? { link: `${getEnv().APP_ORIGIN}/b/${access.code}` } : { linkUrl: `/api/invoices/${id}/link` }),
      ...(access.staff && phone && /^\d{10}$/.test(phone) ? { phone: `91${phone}` } : {}),
    },
  });
}

/**
 * The order's view-only bill link, made the first time anyone shares a bill. Staff can make a new one,
 * which turns the old link off (for a link sent to the wrong person).
 */
export async function billLink(order: { _id: unknown; billShareToken?: string | null; save(): Promise<unknown> }, reset: boolean, actorId?: string) {
  if (!order.billShareToken || reset) {
    const before = order.billShareToken ?? null;
    order.billShareToken = randomBytes(18).toString("base64url");
    await order.save();
    if (reset && actorId)
      await AuditLog.create({ actorId, action: "order.bill-link-reset", target: String(order._id), details: { hadLink: Boolean(before) } });
  }
  return `${getEnv().APP_ORIGIN}/b/${order.billShareToken}`;
}
