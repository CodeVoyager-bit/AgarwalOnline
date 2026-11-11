import { describe, expect, it } from "vitest";
import { homeFaq, type FaqFacts } from "../src/lib/home-faq";

const live: FaqFacts = { areas: ["Nagothane"], feesPaise: [3000], cutoff: "3 PM", freeFromPaise: 50000, online: false };
const answer = (facts: FaqFacts, start: string) => homeFaq("en", facts).find((item) => item.q.startsWith(start))!.a;

describe("home page questions", () => {
  it("answers from Store settings: areas, cutoff, fee and free-delivery amount", () => {
    expect(answer(live, "Do you deliver")).toContain("We deliver in Nagothane.");
    expect(answer(live, "When will")).toContain("Order before 3 PM");
    expect(answer(live, "How much")).toBe("₹30 per order, and free when your basket is ₹500 or more.");
    expect(answer({ ...live, feesPaise: [3000, 5000] }, "How much")).toContain("From ₹30 per order, depending on your area");
    expect(answer({ ...live, areas: [], feesPaise: [] }, "Do you deliver")).toContain("being set up");
  });

  it("speaks of online payment only while it is switched on", () => {
    expect(answer(live, "How do I pay")).not.toMatch(/online/i);
    expect(answer({ ...live, online: true }, "How do I pay")).toContain("pay online");
  });

  it("asks the same questions in Marathi", () => {
    expect(homeFaq("mr", live)).toHaveLength(homeFaq("en", live).length);
    expect(homeFaq("mr", live).map((item) => item.a).join(" ")).not.toContain("ऑनलाइन भरा");
  });
});
