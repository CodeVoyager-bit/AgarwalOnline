import { processWebhook } from "@/lib/payments/service";
import { paymentConfig } from "@/lib/payments/provider";
import { log } from "@/lib/logger";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 1048576)
    return new Response("Too large", { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response("Missing body", { status: 400 });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 1048576) {
      await reader.cancel();
      return new Response("Too large", { status: 413 });
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    await processWebhook(
      raw,
      request.headers.get("x-razorpay-signature") ?? "",
      request.headers.get("x-razorpay-event-id") ?? "",
      paymentConfig().RAZORPAY_WEBHOOK_SECRET,
    );
    log("info", "razorpay.webhook.processed", {
      eventId: request.headers.get("x-razorpay-event-id"),
    });
    return Response.json({ received: true });
  } catch (e) {
    log("error", "razorpay.webhook.failed", { error: e });
    return Response.json(
      { error: "Webhook could not be processed" },
      {
        status:
          e instanceof Error && e.message === "INVALID_SIGNATURE" ? 400 : 503,
      },
    );
  }
}
