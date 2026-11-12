import { describe, expect, it } from "vitest";
import { cleanUrl, scrub } from "../src/lib/analytics-url";

const site = "https://agarwalonline.in";
describe("what Google Analytics is allowed to see", () => {
  it("masks secret links", () => {
    expect(cleanUrl(`${site}/q/LZ751F991cHGyNN2uEVwnzM4`, site)).toBe(`${site}/q/:code`);
    expect(cleanUrl("/family/abc123?x=1#join", site)).toBe(`${site}/family/:code`);
    expect(cleanUrl("/lists/tok", site)).toBe(`${site}/lists/:code`);
    expect(cleanUrl("/school/join/tok", site)).toBe(`${site}/school/join/:code`);
    // a bill link opens the customer's bills, name and address included
    expect(cleanUrl("/b/AbCdEfGhIjKlMnOpQrStUvWx", site)).toBe(`${site}/b/:code`);
    expect(cleanUrl("/account/orders/6a1f", site)).toBe(`${site}/account/orders/6a1f`);
  });
  it("keeps searches, filters and campaign tags, drops everything else", () => {
    expect(cleanUrl("/login?email=a@b.com&then=/account", site)).toBe(`${site}/login`);
    expect(cleanUrl("/signup?phone=9876543210", site)).toBe(`${site}/signup`);
    expect(cleanUrl("/catalog?q=pen&category=pens&edit=1&utm_source=whatsapp", site)).toBe(
      `${site}/catalog?q=pen&category=pens&utm_source=whatsapp`,
    );
    expect(cleanUrl("/catalog?q=9876543210", site)).toBe(`${site}/catalog?q=%5Bnumber%5D`);
  });
  it("names other sites and phone or mail links without their details", () => {
    expect(cleanUrl("tel:+919876543210", site)).toBe("tel:");
    expect(cleanUrl("mailto:hello@agarwalonline.in", site)).toBe("mailto:");
    expect(cleanUrl("https://www.google.com/search?q=agarwal", site)).toBe("https://www.google.com");
  });
  it("masks emails and phone numbers in link words", () => {
    expect(scrub("Mail a@b.co or call +91 98765 43210")).toBe("Mail [email] or call [number]");
    expect(scrub("Pack of 5 · ₹50")).toBe("Pack of 5 · ₹50");
  });
});
