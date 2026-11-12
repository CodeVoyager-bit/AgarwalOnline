import { describe, expect, it } from "vitest";
import { deliveryPromise } from "../src/lib/commerce/delivery";
import { advertisable, type LiveOffer } from "../src/lib/promotions/service";
import { factsOf } from "../src/lib/documents/line-facts";
import { cleanUrl } from "../src/lib/analytics-url";

const rules = { cutoffHour: 15, freeThresholdPaise: 50000, blackoutDates: [] as string[], holidays: [] as number[] };
// Thursday 12 November 2026, 10:00 and 16:00 in India
const morning = new Date("2026-11-12T10:00:00+05:30");
const evening = new Date("2026-11-12T16:00:00+05:30");

describe("the same-day promise", () => {
  it("says today before the cutoff, tomorrow after it", () => {
    expect(deliveryPromise(morning, rules)).toEqual({ today: true, now: "today", later: "tomorrow" });
    expect(deliveryPromise(evening, rules)).toEqual({ today: false, now: "tomorrow", later: "tomorrow" });
  });
  it("never promises a closed day: a holiday or a blackout date names the next open day", () => {
    // Thursday is a weekly holiday
    expect(deliveryPromise(morning, { ...rules, holidays: [4] })).toEqual({ today: false, now: "tomorrow", later: "tomorrow" });
    // today and tomorrow (Thursday and Friday) are closed: Saturday
    expect(deliveryPromise(morning, { ...rules, blackoutDates: ["2026-11-12", "2026-11-13"] }).now).toBe("on Saturday");
  });
});

const offer = (extra: Partial<LiveOffer>): LiveOffer => ({
  _id: "x",
  name: "Offer",
  code: "LOCAL10",
  kind: "code",
  discountType: "percentage",
  discountValue: 10,
  minimumSubtotalPaise: 0,
  startsAt: new Date(0),
  endsAt: new Date(8.64e15),
  ...extra,
});
describe("offers shown on the home page", () => {
  it("never shows a private code or one that's used up", () => {
    expect(advertisable(offer({}))).toBe(true);
    expect(advertisable(offer({ listed: false }))).toBe(false);
    expect(advertisable(offer({ kind: "automatic", code: undefined, listed: false }))).toBe(true);
    expect(advertisable(offer({ globalLimit: 5, redemptionCount: 5 }))).toBe(false);
    expect(advertisable(offer({ globalLimit: 5, redemptionCount: 4 }))).toBe(true);
  });
});

describe("a bill once issued", () => {
  it("keeps the GST rate, HSN and MRP it printed, whatever the product says today", () => {
    const today = new Map([["p1", { gstRatePercent: 5, hsnCode: "4820", mrpPaise: 9000 }]]);
    expect(factsOf({ variantId: "p1", billed: { gstRatePercent: 12, hsnCode: "4820", mrpPaise: 10000 } }, today).gstRatePercent).toBe(12);
    // before the bill is issued: as set today
    expect(factsOf({ variantId: "p1" }, today).gstRatePercent).toBe(5);
    expect(factsOf({ variantId: "p1", billed: {} }, today).mrpPaise).toBe(9000);
  });
});

describe("Google Analytics", () => {
  it("never sees a bill link's code", () => {
    expect(cleanUrl("https://agarwalonline.in/b/AbCdEfGhIjKlMnOpQrStUvWx?print=1", "https://agarwalonline.in")).toBe(
      "https://agarwalonline.in/b/:code",
    );
  });
});
