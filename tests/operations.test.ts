import { it, expect } from "vitest";
import { assertTransition } from "../src/lib/operations/transitions";
it("rejects skipped packing steps and reversed delivery states", () => {
  expect(() => assertTransition("fulfilment", "unassigned", "ready")).toThrow();
  expect(() =>
    assertTransition("delivery", "delivered", "out-for-delivery"),
  ).toThrow();
  expect(() => assertTransition("order", "cancelled", "confirmed")).toThrow();
  expect(() =>
    assertTransition("fulfilment", "picking", "packed"),
  ).not.toThrow();
});
