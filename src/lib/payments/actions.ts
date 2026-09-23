"use server";
import { requirePermission } from "../auth/session";
import { initiatePayment } from "./service";
import { paymentConfig } from "./provider";
import { rateLimit } from "../auth/rate-limit";
export async function startPaymentAction(orderId: string) {
  const user = await requirePermission("order:own");
  await rateLimit(`pay:${user.id}`, 10);
  const config = paymentConfig();
  const order = await initiatePayment(user.id, orderId);
  return { key: config.RAZORPAY_KEY_ID, ...order };
}
