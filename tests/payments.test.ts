import { it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  paymentsEnabled,
  verifyHmac,
  verifyCheckoutSignature,
} from "../src/lib/payments/provider";
it("verifies the original raw webhook bytes and rejects body changes", () => {
  const raw = '{ "event": "payment.captured" }';
  const secret = "test-webhook-secret";
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  expect(verifyHmac(raw, signature, secret)).toBe(true);
  expect(verifyHmac(JSON.stringify(JSON.parse(raw)), signature, secret)).toBe(
    false,
  );
  expect(verifyHmac(raw, "not-a-signature", secret)).toBe(false);
});
it("binds checkout signatures to the server-stored order id", () => {
  const signature = createHmac("sha256", "test-secret")
    .update("order_1|pay_1")
    .digest("hex");
  expect(
    verifyCheckoutSignature("order_1", "pay_1", signature, "test-secret"),
  ).toBe(true);
  expect(
    verifyCheckoutSignature("order_2", "pay_1", signature, "test-secret"),
  ).toBe(false);
});
it("takes online payment only when it is switched on, not just because keys are set", () => {
  const keys = { RAZORPAY_KEY_ID: "rzp_test_key", RAZORPAY_KEY_SECRET: "x".repeat(16), RAZORPAY_WEBHOOK_SECRET: "y".repeat(16) };
  const before = { ...process.env };
  try {
    Object.assign(process.env, keys);
    delete process.env.ONLINE_PAYMENTS;
    expect(paymentsEnabled()).toBe(false);
    process.env.ONLINE_PAYMENTS = "on";
    expect(paymentsEnabled()).toBe(true);
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect(paymentsEnabled()).toBe(false);
  } finally {
    process.env = before;
  }
});
