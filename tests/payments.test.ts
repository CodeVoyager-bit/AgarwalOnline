import { it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
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
