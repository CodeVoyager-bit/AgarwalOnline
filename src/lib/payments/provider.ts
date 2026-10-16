import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export type GatewayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: "INR";
  status: string;
  captured: boolean;
};
export interface PaymentProvider {
  createOrder(input: {
    receipt: string;
    amount: number;
  }): Promise<{ id: string; amount: number; currency: "INR" }>;
  fetchPayment(id: string): Promise<GatewayPayment>;
  refund(input: {
    paymentId: string;
    amount: number;
    receipt: string;
  }): Promise<{ id: string; status: string }>;
}
export function verifyHmac(body: string, signature: string, secret: string) {
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
) {
  return verifyHmac(`${orderId}|${paymentId}`, signature, secret);
}
export function paymentConfig() {
  const config = z
    .object({
      RAZORPAY_KEY_ID: z.string().regex(/^rzp_(test|live)_[A-Za-z\d]+$/),
      RAZORPAY_KEY_SECRET: z.string().min(16),
      RAZORPAY_WEBHOOK_SECRET: z.string().min(16),
    })
    .parse(process.env);
  if (
    process.env.NODE_ENV === "production" &&
    !config.RAZORPAY_KEY_ID.startsWith("rzp_live_")
  )
    throw Error("Production requires Razorpay live credentials");
  return config;
}
/**
 * Whether shoppers can pay online. The owners take cash on delivery only (2026-10-15), so it needs
 * ONLINE_PAYMENTS=on as well as the Razorpay keys: keys left in the deployment don't switch it on.
 * Checkout, placing an order, the assistant and the shop's own words all follow this one switch.
 * The policies don't: since 2026-10-16.1 they describe cash on delivery only, so switching this on
 * means putting the Razorpay text back in privacy/terms/refunds (git history) and bumping POLICY_VERSION.
 */
export function paymentsEnabled() {
  return Boolean(
    process.env.ONLINE_PAYMENTS === "on" &&
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAY_WEBHOOK_SECRET,
  );
}
const paymentSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  amount: z.number().int().nonnegative(),
  currency: z.literal("INR"),
  status: z.string(),
  captured: z.boolean(),
});
export class RazorpayProvider implements PaymentProvider {
  private async request(path: string, body?: unknown) {
    const env = paymentConfig();
    const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!response.ok)
      throw Error("Payment provider could not complete the request.");
    return response.json();
  }
  async createOrder(input: { receipt: string; amount: number }) {
    return z
      .object({
        id: z.string().regex(/^order_[A-Za-z\d]+$/),
        amount: z.number().int(),
        currency: z.literal("INR"),
      })
      .parse(
        await this.request("orders", {
          amount: input.amount,
          currency: "INR",
          receipt: input.receipt,
          partial_payment: false,
        }),
      );
  }
  async fetchPayment(id: string) {
    z.string()
      .regex(/^pay_[A-Za-z\d]+$/)
      .parse(id);
    return paymentSchema.parse(await this.request(`payments/${id}`));
  }
  async refund(input: { paymentId: string; amount: number; receipt: string }) {
    z.string()
      .regex(/^pay_[A-Za-z\d]+$/)
      .parse(input.paymentId);
    return z.object({ id: z.string(), status: z.string() }).parse(
      await this.request(`payments/${input.paymentId}/refund`, {
        amount: input.amount,
        receipt: input.receipt,
      }),
    );
  }
}
