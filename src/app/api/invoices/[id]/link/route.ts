import { currentUser } from "@/lib/auth/session";
import { billAccess, billLink, plainText } from "@/lib/documents/bill-request";

/**
 * The order's view-only bill link (/b/<code>), for WhatsApp on a computer, where a website can't attach
 * the PDF itself. Made the first time it is asked for. Staff can ask for a new one with ?reset=1, which
 * turns the old link off.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (new URL(request.url).searchParams.has("code")) return plainText("Sign in to share a bill.", 401);
  const access = await billAccess(request, (await params).id);
  if ("error" in access) return access.error;
  if (access.order.orderStatus === "cancelled") return plainText("A cancelled order has no bill to share.", 409);
  const reset = new URL(request.url).searchParams.get("reset") === "1";
  if (reset && !access.staff) return plainText("Only the store can make a new bill link.", 403);
  const user = reset ? await currentUser() : null;
  const url = await billLink(access.order, reset, user?.id);
  return Response.json({ url }, { headers: { "Cache-Control": "private, no-store" } });
}
