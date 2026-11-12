import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { Category, InventoryItem, Product, ProductVariant, User, parentsOf } from "../src/lib/db/models";
import { CartLine } from "../src/lib/commerce/models";
import { saveCategory, setProductVisibility, sortIntoCategories, updateProductMetadata, updateVariant } from "../src/lib/catalog/manage";
import { catalog, catalogSections } from "../src/lib/catalog/queries";
import { AuditLog } from "../src/lib/db/models";
import { basketFor, setCartLine } from "../src/lib/commerce/service";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Showing, hiding and changing packs", () => {
  let admin: string, customer: string, productId: string, variantId: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, InventoryItem, CartLine]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    admin = String((await User.create({ name: "Staff", phone: "9000000061", roles: ["customer", "admin"] }))._id);
    customer = String((await User.create({ name: "Shopper", phone: "9000000062", roles: ["customer"] }))._id);
    const category = await Category.create({ slug: "paper", name: { en: "Paper", mr: "कागद" } });
    const product = await Product.create({
      slug: "notebook",
      name: { en: "Notebook", mr: "वही" },
      description: { en: "Notebook", mr: "वही" },
      categoryId: category._id,
      categorySlug: "paper",
      status: "published",
    });
    productId = String(product._id);
    const variant = await ProductVariant.create({
      productId: product._id,
      sku: "NB-100",
      label: "100 pages",
      unit: "piece",
      packQuantity: 1,
      pricePaise: 3000,
      mrpPaise: 3500,
    });
    variantId = String(variant._id);
    await InventoryItem.create({ variantId: variant._id, onHand: 20 });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("hides a product and shows it again", async () => {
    await setProductVisibility(admin, { productId, visible: "hide" });
    expect(await catalog({ slug: "notebook" })).toHaveLength(0);
    await setProductVisibility(admin, { productId, visible: "show" });
    expect(await catalog({ slug: "notebook" })).toHaveLength(1);
  });

  it("won't show a product that has no pack to sell", async () => {
    await setProductVisibility(admin, { productId, visible: "hide" });
    await ProductVariant.updateOne({ _id: variantId }, { active: false });
    await expect(setProductVisibility(admin, { productId, visible: "show" })).rejects.toThrow("no pack to sell");
  });

  it("renames a pack, changes its limit, and hides it from the shop and baskets", async () => {
    await setCartLine(customer, variantId, 2);
    await updateVariant(admin, { variantId, label: "100-page notebook", maxQuantity: 30, active: true });
    const renamed = await ProductVariant.findById(variantId);
    expect(renamed?.label).toBe("100-page notebook");
    expect(renamed?.maxQuantity).toBe(30);
    await updateVariant(admin, { variantId, label: "100-page notebook", maxQuantity: 30, active: false });
    expect(await catalog({ slug: "notebook" })).toHaveLength(0); // no buyable pack left
    const basket = await basketFor(customer);
    expect(basket.lines).toHaveLength(0);
    expect(basket.unavailable[0]?.label).toBe("100-page notebook");
    await expect(setCartLine(customer, variantId, 1)).rejects.toThrow("unavailable");
  });

  const paperFields = { slug: "paper", nameEn: "Paper", nameMr: "कागद" };
  it("puts a shelf in two sections, and keeps the shop two levels deep", async () => {
    const paper = String((await Category.findOne({ slug: "paper" }))!._id);
    const [school, office] = (
      await Category.create([
        { slug: "for-school", name: { en: "School", mr: "शाळा" } },
        { slug: "for-office", name: { en: "Office", mr: "कार्यालय" } },
      ])
    ).map((section: { _id: unknown }) => String(section._id));
    await saveCategory(admin, { ...paperFields, categoryId: paper, parentIds: [school, office] });
    expect(parentsOf((await Category.findById(paper))!)).toEqual([school, office]);
    // a section that holds shelves can't go inside another, and nothing goes inside a shelf
    await expect(
      saveCategory(admin, { categoryId: school, slug: "for-school", nameEn: "School", nameMr: "शाळा", parentIds: [office] }),
    ).rejects.toThrow("holds others");
    await expect(saveCategory(admin, { slug: "pens", nameEn: "Pens", nameMr: "पेन", parentIds: [paper] })).rejects.toThrow("top-level");
    await expect(saveCategory(admin, { ...paperFields, categoryId: paper, parentIds: [paper] })).rejects.toThrow("inside itself");
    // unticking every section makes it a plain shelf again
    await saveCategory(admin, { ...paperFields, categoryId: paper, parentIds: [] });
    expect(parentsOf((await Category.findById(paper))!)).toEqual([]);
  });

  it("sorts loose subcategories into the shop's categories, once", async () => {
    await Category.create([
      { slug: "pens", name: { en: "Pens", mr: "पेन" } },
      { slug: "office-supplies", name: { en: "Office Supplies", mr: "कार्यालयीन साहित्य" } },
      { slug: "pooja-needs", name: { en: "Pooja Needs", mr: "पूजा साहित्य" } },
    ]);
    // Pens goes in two; a category nobody has subcategories for (toys, gifts) isn't made
    expect((await sortIntoCategories(admin)).moves).toBe(4);
    expect((await catalogSections()).map((section) => [section.slug, section.shelves.map((shelf) => shelf.slug)])).toEqual([
      ["stationery", ["pens"]],
      ["office", ["pens", "office-supplies"]],
      ["home-pooja", ["pooja-needs"]],
      ["", ["paper"]],
    ]);
    expect(await AuditLog.countDocuments({ action: "category.sort" })).toBe(1);
    // a second tap finds nothing left to do, and a subcategory moved by hand since then stays where it was put
    const pens = (await Category.findOne({ slug: "pens" }))!;
    const office = (await Category.findOne({ slug: "office" }))!;
    await saveCategory(admin, { categoryId: String(pens._id), slug: "pens", nameEn: "Pens", nameMr: "पेन", parentIds: [String(office._id)] });
    expect((await sortIntoCategories(admin)).moves).toBe(1); // Pens back under Stationery; Office is kept
    expect(parentsOf((await Category.findById(pens._id))!)).toHaveLength(2);
    expect((await sortIntoCategories(admin)).moves).toBe(0);
  });

  it("saves a product's extra shelves and keeps them through a shelf's new web address", async () => {
    const paper = String((await Category.findOne({ slug: "paper" }))!._id);
    const craft = await Category.create({ slug: "craft", name: { en: "Craft", mr: "हस्तकला" } });
    await Category.create({ slug: "gifts", name: { en: "Gifts", mr: "भेटवस्तू" } });
    await Category.create({ slug: "office", name: { en: "Office", mr: "कार्यालय" } });
    const details = {
      productId,
      nameEn: "Notebook",
      nameMr: "वही",
      descriptionEn: "A ruled notebook",
      descriptionMr: "रेघी वही",
      brand: "",
      categoryId: paper,
      aliases: "",
      featured: false,
      bestseller: false,
    };
    // its own shelf isn't an extra one, and a slug that isn't a shelf is refused
    await updateProductMetadata(admin, { ...details, alsoOn: ["craft", "paper"] });
    expect((await Product.findById(productId))!.alsoOn).toEqual(["craft"]);
    await expect(updateProductMetadata(admin, { ...details, alsoOn: ["craft", "gifts", "office"] })).rejects.toThrow();
    await expect(updateProductMetadata(admin, { ...details, alsoOn: ["nowhere"] })).rejects.toThrow("Category not found");
    await saveCategory(admin, { categoryId: String(craft._id), slug: "art-craft", nameEn: "Craft", nameMr: "हस्तकला" });
    expect((await Product.findById(productId))!.alsoOn).toEqual(["art-craft"]);
    expect((await catalog({ category: "art-craft" })).map((item) => item.slug)).toEqual(["notebook"]);
    // a form that doesn't send the extra shelves (an older page) leaves them alone
    await updateProductMetadata(admin, details);
    expect((await Product.findById(productId))!.alsoOn).toEqual(["art-craft"]);
  });
});
