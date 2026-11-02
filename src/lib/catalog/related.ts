import "server-only";

import { Order } from "../commerce/models";
import { connectDB } from "../db/connect";
import { shared } from "../db/shop-cache";
import { catalog, type CatalogItem } from "./queries";
import { recommendationsFor } from "./recommendations";
import { companionsFrom, pickRows, unitsByProduct, type OrderLines } from "./related-rules";

/** How far back sales count: recent enough to say what people buy now. */
const SALES_DAYS = 180;
/** Enough orders to show a pattern, and a ceiling on what one product page reads. */
const ORDERS_READ = 500;

const sales = () => ({
  createdAt: { $gte: new Date(Date.now() - SALES_DAYS * 86400 * 1000) },
  orderStatus: { $ne: "cancelled" },
});

/** The recent orders with this product in them: who ordered, and which packs. Kept for a minute (the shop cache). */
function ordersWith(product: CatalogItem) {
  return shared(`orders-with:${product.id}`, async (): Promise<OrderLines[]> => {
    await connectDB();
    const orders = await Order.find({ ...sales(), "items.variantId": { $in: product.variants.map((variant) => variant.id) } })
      .sort({ createdAt: -1 })
      .limit(ORDERS_READ)
      .select("customerId items.variantId")
      .lean<{ customerId: unknown; items: { variantId: unknown }[] }[]>();
    return orders.map((order) => ({
      customerId: String(order.customerId),
      variantIds: order.items.map((item) => String(item.variantId)),
    }));
  });
}

/** Units sold per pack, for "Popular in this category". */
const unitsSold = () =>
  shared("units-sold", async () => {
    await connectDB();
    const rows = await Order.aggregate<{ _id: unknown; units: number }>([
      { $match: sales() },
      { $unwind: "$items" },
      { $group: { _id: "$items.variantId", units: { $sum: "$items.quantity" } } },
    ]);
    return rows.map((row) => [String(row._id), row.units] as const);
  });

/** What goes under a product page. Shoppers only ever see the items, never counts or who bought them. */
export async function relatedFor({ product, customerId }: { product: CatalogItem; customerId?: string }) {
  // catalog() is the shoppers' list, so hidden and school-only items can't appear
  const [all, ranked, orders, packs] = await Promise.all([
    catalog(),
    recommendationsFor({ customerId, excludeSlug: product.slug, limit: 200 }),
    ordersWith(product),
    unitsSold(),
  ]);
  const productOf = new Map(all.flatMap((item) => item.variants.map((variant) => [variant.id, item.id] as const)));
  return pickRows({
    product,
    all,
    companions: companionsFrom(orders, product, productOf),
    sold: unitsByProduct(packs, productOf),
    ranked,
  });
}
