import { requirePermission } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { verifyCustomerPayment } from "@/lib/payments/service";
import { rateLimit } from "@/lib/auth/rate-limit";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== getEnv().APP_ORIGIN)
    return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const user = await requirePermission("order:own");
    await rateLimit(`verify-payment:${user.id}`, 20);
    const captured = await verifyCustomerPayment(user.id, await request.json());
    return Response.json({ captured });
  } catch {
    return Response.json(
      {
        error:
          "Payment could not be verified. Your order will update after confirmation.",
      },
      { status: 400 },
    );
  }
}
