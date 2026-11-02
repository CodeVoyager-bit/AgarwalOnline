import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, InventoryItem, Product, ProductVariant } from "../src/lib/db/models";
import { Order } from "../src/lib/commerce/models";
import { catalog } from "../src/lib/catalog/queries";
import { relatedFor } from "../src/lib/catalog/related";

vi.mock("server-only", () => ({}));

const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("What goes under a product page", () => {
  const packs = new Map<string, mongoose.Types.ObjectId>();
  let orderNumber = 0;

  async function addProduct(slug: string, categorySlug: string, stock: number, over: Record<string, unknown> = {}) {
    const category = await Category.findOne({ slug: categorySlug });
    const product = await Product.create({
      slug,
      name: { en: slug, mr: slug },
      description: { en: "A test item", mr: "चाचणी वस्तू" },
      brand: "TEST",
      categoryId: category!._id,
      categorySlug,
      status: "published",
      ...over,
    });
    const pack = await ProductVariant.create({
      productId: product._id,
      sku: `SKU-${slug}`,
      label: "1 piece",
      unit: "piece",
      packQuantity: 1,
      pricePaise: 1000,
      mrpPaise: 1000,
    });
    await InventoryItem.create({ variantId: pack._id, onHand: stock });
    packs.set(slug, pack._id);
  }
  async function addOrder(customer: string, slugs: string[], over: Record<string, unknown> = {}) {
    await Order.collection.insertOne({
      customerId: new mongoose.Types.ObjectId(customer.padStart(24, "0")),
      number: `AGS-TEST-${++orderNumber}`,
      idempotencyKey: `related-${orderNumber}`,
      items: slugs.map((slug) => ({ variantId: packs.get(slug), name: slug, label: "1 piece", quantity: 2, pricePaise: 1000, linePaise: 2000 })),
      orderStatus: "confirmed",
      createdAt: new Date(),
      ...over,
    });
  }
  async function rowsFor(slug: string) {
    const product = (await catalog({ slug }))[0];
    const rows = await relatedFor({ product });
    const names = (list: { slug: string }[]) => list.map((item) => item.slug);
    return {
      ...rows,
      together: names(rows.together),
      popular: names(rows.popular),
      similar: names(rows.similar),
      others: names(rows.others),
    };
  }

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    await Order.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    packs.clear();
    await Category.create([
      { slug: "books", name: { en: "Books", mr: "वह्या" } },
      { slug: "toys", name: { en: "Toys", mr: "खेळणी" } },
    ]);
    await addProduct("book", "books", 5);
    await addProduct("graph-book", "books", 5);
    await addProduct("pen", "books", 5);
    await addProduct("car", "toys", 5);
    await addProduct("doll", "toys", 5);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("bundles what two different customers really ordered with this item", async () => {
    await addOrder("a", ["book", "car"]);
    await addOrder("b", ["book", "car", "pen"]);
    await addOrder("c", ["book", "pen"]);
    await addOrder("c", ["book", "doll"]);
    const rows = await rowsFor("book");
    expect(rows.together.sort()).toEqual(["car", "pen"]);
    expect(rows.popular).toEqual([]);
    // the only other book left, and the toy that wasn't bought together
    expect(rows.similar).toEqual(["graph-book"]);
    expect(rows.others).toEqual(["doll"]);
  });

  it("shows popular items by units sold while sales can't say what's bought together", async () => {
    // one customer isn't a pattern, and neither are cancelled orders or old ones
    await addOrder("a", ["book", "car"]);
    await addOrder("b", ["book", "car"], { orderStatus: "cancelled" });
    await addOrder("c", ["book", "car"], { createdAt: new Date(Date.now() - 200 * 86400 * 1000) });
    await addOrder("d", ["pen"]);
    const rows = await rowsFor("book");
    expect(rows.together).toEqual([]);
    expect(rows.popularScope).toBe("category");
    expect(rows.popular).toEqual(["pen"]);
    expect(rows.similar).toEqual(["graph-book"]);
    expect(rows.others.sort()).toEqual(["car", "doll"]);
  });

  it("never offers sold-out or school-only items, however often they were bought", async () => {
    await addProduct("sold-out", "books", 0);
    await addProduct("school-only", "books", 5, { showToCustomers: false, showToSchools: true });
    await addOrder("a", ["book", "sold-out", "school-only"]);
    await addOrder("b", ["book", "sold-out", "school-only"]);
    const rows = await rowsFor("book");
    const every = [...rows.together, ...rows.popular, ...rows.similar, ...rows.others];
    expect(every).not.toContain("sold-out");
    expect(every).not.toContain("school-only");
    expect(every).not.toContain("book");
  });

  it("still shows what goes with an item that's sold out", async () => {
    await addProduct("gone", "books", 0);
    await addOrder("a", ["gone", "car"]);
    await addOrder("b", ["gone", "car"]);
    const rows = await rowsFor("gone");
    expect(rows.together).toEqual(["car"]);
  });
});
