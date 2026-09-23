import { it, expect } from "vitest";
import {
  earliestDelivery,
  deliveryFee,
  defaultRules,
} from "../src/lib/commerce/delivery";
it("uses the IST 3 PM boundary, including exact cutoff", () => {
  expect(earliestDelivery(new Date("2026-09-10T09:29:59Z"), defaultRules)).toBe(
    "2026-09-10",
  );
  expect(earliestDelivery(new Date("2026-09-10T09:30:00Z"), defaultRules)).toBe(
    "2026-09-11",
  );
});
it("skips holidays and blackout dates", () => {
  expect(
    earliestDelivery(new Date("2026-09-10T09:30:00Z"), {
      ...defaultRules,
      blackoutDates: ["2026-09-11"],
      holidays: [6, 0],
    }),
  ).toBe("2026-09-14");
});
it("calculates free delivery at exactly 500 rupees", () => {
  expect(deliveryFee(49999, 3000, defaultRules)).toBe(3000);
  expect(deliveryFee(50000, 3000, defaultRules)).toBe(0);
});
