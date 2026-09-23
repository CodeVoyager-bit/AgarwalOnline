import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import {
  Category,
  Product,
  ProductVariant,
  InventoryItem,
} from "../src/lib/db/models";
import { catalog } from "../src/lib/catalog/queries";
const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("MongoDB catalog", () => {
  beforeAll(async () => {
    if (!uri?.includes("/ags_test"))
      throw Error("Isolated test database required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
      MOCK_OTP: "true",
    });
    await connectDB();
    await mongoose.connection.dropDatabase();
    const c = await Category.create({
      slug: "staples",
      name: { en: "Staples", mr: "धान्य" },
    });
    for (const status of ["published", "draft"]) {
      const p = await Product.create({
        slug: `rice-${status}`,
        name: { en: "Basmati Rice", mr: "बासमती तांदूळ" },
        description: { en: "Rice", mr: "तांदूळ" },
        categoryId: c._id,
        categorySlug: "staples",
        status,
        aliases: ["chawal"],
      });
      const v = await ProductVariant.create({
        productId: p._id,
        sku: status,
        label: "1 kg",
        unit: "kg",
        packQuantity: 1,
        pricePaise: 10000,
        mrpPaise: 12000,
      });
      await InventoryItem.create({ variantId: v._id, onHand: 10, reserved: 3 });
    }
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  it("returns the same published product for all three language queries", async () => {
    for (const q of ["Rice", "Chawal", "तांदूळ"]) {
      const results = await catalog({ q });
      expect(results).toHaveLength(1);
      expect(results[0].slug).toBe("rice-published");
      expect(results[0].variants[0].available).toBe(7);
    }
  });
  it("does not turn punctuation into unrestricted regex matching", async () => {
    expect(await catalog({ q: "nonexistent.*" })).toHaveLength(0);
  });
});
