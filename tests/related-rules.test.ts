import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../src/lib/catalog/queries";
import { companionsFrom, pickRows, popularOrder, similarTo, unitsByProduct } from "../src/lib/catalog/related-rules";

function item(id: string, over: Partial<CatalogItem> & { stock?: number; price?: number } = {}): CatalogItem {
  const { stock = 5, price = 100, ...rest } = over;
  return {
    id,
    slug: id,
    name: { en: id, mr: id },
    description: { en: "", mr: "" },
    brand: "",
    images: [],
    highlights: [],
    dietaryTags: [],
    specifications: [],
    featured: false,
    bestseller: false,
    categorySlug: "books",
    alsoOn: [],
    variants: [{ id: `${id}-pack`, label: "1", pricePaise: price, mrpPaise: price, available: stock, maxQuantity: 10 }],
    rating: 0,
    reviewCount: 0,
    ...rest,
  };
}
const productOf = (...items: CatalogItem[]) => new Map(items.flatMap((i) => i.variants.map((v) => [v.id, i.id] as const)));

describe("what was bought together", () => {
  const book = item("book");
  const pen = item("pen");
  const eraser = item("eraser");
  const map = productOf(book, pen, eraser);

  it("needs two different customers, not one customer twice", () => {
    const orders = [
      { customerId: "asha", variantIds: ["book-pack", "pen-pack"] },
      { customerId: "asha", variantIds: ["book-pack", "pen-pack"] },
    ];
    expect(companionsFrom(orders, book, map)).toEqual([]);
    expect(companionsFrom([...orders, { customerId: "ravi", variantIds: ["book-pack", "pen-pack"] }], book, map)).toEqual(["pen"]);
  });

  it("puts what the most customers share first", () => {
    const orders = [
      { customerId: "a", variantIds: ["book-pack", "pen-pack", "eraser-pack"] },
      { customerId: "b", variantIds: ["book-pack", "eraser-pack"] },
      { customerId: "c", variantIds: ["book-pack", "eraser-pack", "pen-pack"] },
      { customerId: "d", variantIds: ["book-pack", "eraser-pack"] },
    ];
    expect(companionsFrom(orders, book, map)).toEqual(["eraser", "pen"]);
  });

  it("only counts orders with this item in them, and skips packs no longer on sale", () => {
    const orders = [
      { customerId: "a", variantIds: ["pen-pack", "eraser-pack"] },
      { customerId: "b", variantIds: ["pen-pack", "eraser-pack"] },
      { customerId: "c", variantIds: ["book-pack", "gone-pack"] },
      { customerId: "d", variantIds: ["book-pack", "gone-pack"] },
    ];
    expect(companionsFrom(orders, book, map)).toEqual([]);
  });
});

describe("popular and similar", () => {
  it("orders popular by units sold, then the shop's own marks", () => {
    const sold = unitsByProduct([["c-pack", 3], ["c-pack", 2], ["gone-pack", 99]], productOf(item("a"), item("b"), item("c")));
    expect(sold.get("c")).toBe(5);
    const ordered = popularOrder([item("a"), item("b", { bestseller: true }), item("c")], sold);
    expect(ordered.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("puts the same brand first, then the closest price", () => {
    const book = item("book", { brand: "Vidya", price: 100 });
    const ordered = similarTo(book, [
      item("near", { price: 110 }),
      item("far", { price: 500 }),
      item("brand", { brand: "Vidya", price: 900 }),
    ]);
    expect(ordered.map((i) => i.id)).toEqual(["brand", "near", "far"]);
  });
});

describe("the rows on the page", () => {
  const book = item("book");
  const others = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => item(id, { categorySlug: "toys" }));
  const sameCategory = ["s1", "s2", "s3", "s4"].map((id) => item(id));
  const all = [book, ...sameCategory, ...others];
  const rows = (over: Partial<Parameters<typeof pickRows>[0]> = {}) =>
    pickRows({ product: book, all, companions: [], sold: new Map(), ranked: others, ...over });
  const ids = (list: CatalogItem[]) => list.map((i) => i.id);

  it("uses sales when there are any, up to two others, and no popular row", () => {
    const shown = rows({ companions: ["s1", "a", "b"] });
    expect(ids(shown.together)).toEqual(["s1", "a"]);
    expect(shown.popular).toEqual([]);
  });

  it("falls back to popular in the category, leaving Similar something to show", () => {
    const shown = rows();
    expect(shown.together).toEqual([]);
    expect(shown.popularScope).toBe("category");
    expect(shown.popular).toHaveLength(2);
    expect(shown.similar).toHaveLength(2);
  });

  it("falls back to the whole shop when the category has nothing else", () => {
    const shown = pickRows({ product: book, all: [book, ...others], companions: [], sold: new Map(), ranked: others });
    expect(shown.popularScope).toBe("shop");
    expect(shown.popular).toHaveLength(5);
    expect(shown.similar).toEqual([]);
    expect(shown.others).toHaveLength(3);
  });

  it("never shows an item twice, or this item", () => {
    for (const shown of [rows(), rows({ companions: ["s1", "a"] })]) {
      const every = [...shown.together, ...shown.popular, ...shown.similar, ...shown.others].map((i) => i.id);
      expect(new Set(every).size).toBe(every.length);
      expect(every).not.toContain("book");
    }
  });

  it("leaves out what's sold out, and the same category from Other items", () => {
    const soldOut = item("gone", { stock: 0 });
    const shown = rows({ all: [...all, soldOut], companions: ["gone", "s1"], ranked: [soldOut, ...sameCategory, ...others] });
    expect(ids(shown.together)).toEqual(["s1"]);
    expect(ids(shown.similar)).not.toContain("gone");
    expect(shown.others.every((i) => i.categorySlug === "toys")).toBe(true);
    expect(ids(shown.others)).not.toContain("gone");
  });

  it("gives a sold-out item a whole row of what goes with it, since it can't be bundled", () => {
    const gone = item("gone", { stock: 0 });
    const shown = pickRows({ product: gone, all: [gone, ...others], companions: ["a", "b", "c"], sold: new Map(), ranked: others });
    expect(ids(shown.together)).toEqual(["a", "b", "c"]);
  });
});
