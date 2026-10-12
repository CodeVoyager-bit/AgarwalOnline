import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/lib/catalog/queries";
import { jsonLd, productJsonLd, storeJsonLd } from "../src/lib/seo";

const origin = "https://agarwalonline.in";
const pen = {
  slug: "ball-pen",
  name: { en: "Ball Pen", mr: "बॉल पेन" },
  description: { en: "A pen", mr: "पेन" },
  brand: "",
  categorySlug: "writing",
  rating: 0,
  reviewCount: 0,
  variants: [
    { id: "a", label: "Pack of 5", pricePaise: 5500, mrpPaise: 6000, available: 3, maxQuantity: 5 },
    { id: "b", label: "Pack of 10", pricePaise: 9900, mrpPaise: 9900, available: 0, maxQuantity: 5 },
  ],
} as CatalogItem;

describe("Search engine data", () => {
  it("describes every pack of a product, with absolute photo links", () => {
    const [product, crumbs] = productJsonLd(pen, origin, "Writing", ["/api/evidence/abc", "https://images.example/x.jpg"]);
    expect(product.image).toEqual([`${origin}/api/evidence/abc`, "https://images.example/x.jpg"]);
    expect(product).not.toHaveProperty("brand");
    expect(product).not.toHaveProperty("aggregateRating");
    expect(product.offers.map((offer) => [offer.name, offer.price, offer.availability])).toEqual([
      ["Pack of 5", "55.00", "https://schema.org/InStock"],
      ["Pack of 10", "99.00", "https://schema.org/OutOfStock"],
    ]);
    expect(crumbs.itemListElement.map((crumb) => [crumb.position, crumb.item])).toEqual([
      [1, `${origin}/catalog`],
      [2, `${origin}/catalog?category=writing`],
      [3, `${origin}/products/ball-pen`],
    ]);
  });

  it("shows a rating only once there are verified reviews", () => {
    const [product] = productJsonLd({ ...pen, brand: "Writewell", rating: 4.5, reviewCount: 2 }, origin, "Writing", []);
    expect(product).toMatchObject({ brand: { name: "Writewell" }, aggregateRating: { ratingValue: 4.5, reviewCount: 2 } });
    expect(product).not.toHaveProperty("image");
  });

  it("leaves out store details the owner hasn't saved", () => {
    const store = storeJsonLd({ legalName: "Agarwal General Stores", address: "Nagothane, Raigad" }, ["Nagothane"], origin);
    expect(store).not.toHaveProperty("telephone");
    expect(store.areaServed).toEqual([{ "@type": "Place", name: "Nagothane" }]);
    expect(storeJsonLd({ legalName: "A", address: "B", phone: "9000000000" }, [], origin).telephone).toBe("+919000000000");
  });

  it("can't be broken out of its script tag", () => {
    expect(jsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
});
