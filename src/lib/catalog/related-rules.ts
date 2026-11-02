import type { CatalogItem } from "./queries";

/*
 * What goes under a product page: what was really bought with it, what is like it and what is
 * something else. No database here, so the rules can be tested on their own (src/lib/catalog/related.ts
 * reads the orders).
 */

/** Another item counts as bought together only once this many different customers ordered it with this one. */
export const MIN_CUSTOMERS = 2;
/** This item plus up to two others: "Add all 3". */
export const BUNDLE_OTHERS = 2;
/** Items in a row: five across on a computer. */
export const ROW_SIZE = 5;

export type OrderLines = { customerId: string; variantIds: string[] };
export type Related = {
  together: CatalogItem[];
  /** Stands in for `together` while sales can't yet show what's bought together. */
  popular: CatalogItem[];
  popularScope: "category" | "shop";
  similar: CatalogItem[];
  others: CatalogItem[];
};

export const inStock = (item: CatalogItem) => item.variants.some((variant) => variant.available > 0);
const priceOf = (item: CatalogItem) => (item.variants.find((variant) => variant.available > 0) ?? item.variants[0])?.pricePaise ?? 0;

/** The products ordered alongside this one by at least MIN_CUSTOMERS different customers, most-shared first. */
export function companionsFrom(orders: OrderLines[], item: CatalogItem, productOf: Map<string, string>) {
  const own = new Set(item.variants.map((variant) => variant.id));
  const customers = new Map<string, Set<string>>();
  const seen = new Map<string, number>();
  for (const order of orders) {
    if (!order.variantIds.some((id) => own.has(id))) continue;
    const others = new Set(order.variantIds.map((id) => productOf.get(id)).filter((id) => id && id !== item.id) as string[]);
    for (const id of others) {
      customers.set(id, (customers.get(id) ?? new Set()).add(order.customerId));
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  return [...customers]
    .filter(([, who]) => who.size >= MIN_CUSTOMERS)
    .sort(([a, whoA], [b, whoB]) => whoB.size - whoA.size || (seen.get(b) ?? 0) - (seen.get(a) ?? 0))
    .map(([id]) => id);
}

/** Units sold per product, from units sold per pack. */
export function unitsByProduct(packs: readonly (readonly [string, number])[], productOf: Map<string, string>) {
  const units = new Map<string, number>();
  for (const [variantId, sold] of packs) {
    const id = productOf.get(variantId);
    if (id) units.set(id, (units.get(id) ?? 0) + sold);
  }
  return units;
}

/** Best sellers first by real units sold; where nothing has sold, the shop's own bestseller and featured marks. */
export function popularOrder(items: CatalogItem[], sold: Map<string, number>) {
  return [...items].sort(
    (a, b) =>
      (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0) ||
      Number(b.bestseller) - Number(a.bestseller) ||
      Number(b.featured) - Number(a.featured) ||
      a.name.en.localeCompare(b.name.en),
  );
}

/** Items like this one, from those given: same brand first, then closest in price. */
export function similarTo(item: CatalogItem, items: CatalogItem[]) {
  const sameBrand = (other: CatalogItem) => Number(Boolean(item.brand) && other.brand === item.brand);
  const gap = (other: CatalogItem) => Math.abs(priceOf(other) - priceOf(item));
  return [...items].sort(
    (a, b) => sameBrand(b) - sameBrand(a) || gap(a) - gap(b) || a.name.en.localeCompare(b.name.en),
  );
}

/** The rows for a product page. Only what can be bought now, and no item twice. */
export function pickRows({
  product,
  all,
  companions,
  sold,
  ranked,
}: {
  product: CatalogItem;
  all: CatalogItem[];
  /** Product ids from `companionsFrom`. */
  companions: string[];
  sold: Map<string, number>;
  /** Other items, in the order this shopper should see them. */
  ranked: CatalogItem[];
}): Related {
  const choices = all.filter((item) => item.id !== product.id && inStock(item));
  const byId = new Map(choices.map((item) => [item.id, item]));
  // a sold-out item can't go in the "Add all" box, so what goes with it gets a whole row instead
  const together = companions.flatMap((id) => byId.get(id) ?? []).slice(0, inStock(product) ? BUNDLE_OTHERS : ROW_SIZE);
  const sameCategory = choices.filter((item) => item.categorySlug === product.categorySlug);
  const popularScope = sameCategory.length ? "category" : "shop";
  // half of a small category at most, so Similar items has something left to show
  const popular = together.length
    ? []
    : sameCategory.length
      ? popularOrder(sameCategory, sold).slice(0, Math.min(ROW_SIZE, Math.ceil(sameCategory.length / 2)))
      : popularOrder(choices, sold).slice(0, ROW_SIZE);
  const shown = new Set([...together, ...popular].map((item) => item.id));
  const similar = similarTo(product, sameCategory.filter((item) => !shown.has(item.id))).slice(0, ROW_SIZE);
  for (const item of similar) shown.add(item.id);
  const others = ranked
    .filter((item) => item.categorySlug !== product.categorySlug && byId.has(item.id) && !shown.has(item.id))
    .slice(0, ROW_SIZE);
  return { together, popular, popularScope, similar, others };
}
