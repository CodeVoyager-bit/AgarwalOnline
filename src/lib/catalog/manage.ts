import mongoose from "mongoose";
import { z } from "zod";
import { assertPermission, type Permission, type Role } from "../auth/permissions";
import { connectDB } from "../db/connect";
import {
  AuditLog,
  Category,
  InventoryItem,
  Product,
  ProductVariant,
  User,
  parentsOf,
} from "../db/models";
import { objectId } from "../commerce/service";
import { gstRateField, hsnField, optionalField } from "../tax/gst";
import { orderedPhotos, photoFields, photoList } from "./photos";
import { chosenProvider } from "../providers/service";
import { notDeleted } from "./deleted";
import { groupShelves } from "./sections";

async function authorize(actorId: string, permission: Permission = "catalog:write") {
  await connectDB();
  const actor = await User.findOne({
    _id: objectId.parse(actorId),
    active: true,
  });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], permission);
}

const categoryInput = z.object({
  categoryId: objectId.optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(60),
  nameEn: z.string().trim().min(2).max(80),
  // the site is English only: a Marathi name is optional and kept for search
  nameMr: z.string().trim().max(80).optional(),
  /** Not on the form any more (nothing shows it); a category that has one keeps it. */
  symbol: z.string().trim().max(12).optional(),
  /** The sections it shows under; none makes it a top-level category. */
  parentIds: z.array(objectId).max(10).default([]),
});

export async function saveCategory(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = categoryInput.parse(input);
  const parentIds = [...new Set(data.parentIds)];
  if (data.categoryId && parentIds.includes(data.categoryId)) throw Error("A category cannot be inside itself.");
  await mongoose.connection.transaction(async (session) => {
    if (parentIds.length) {
      // two levels and no deeper: sections at the top, shelves inside them (so there are no loops to look for)
      const parents = await Category.find({ _id: { $in: parentIds } }).session(session);
      if (parents.length !== parentIds.length) throw Error("Parent category not found.");
      if (parents.some((parent) => parentsOf(parent).length)) throw Error("A category can only sit inside a top-level one.");
      if (
        data.categoryId &&
        (await Category.exists({ parentIds: data.categoryId }).session(session))
      )
        throw Error("A category that holds others can’t sit inside one itself.");
    }
    const before = data.categoryId
      ? await Category.findById(data.categoryId).session(session).lean<{ slug: string; name: { en: string; mr: string } }>()
      : null;
    const payload = {
      slug: data.slug,
      // an edit keeps the Marathi name search matches; a new category starts with the English one
      name: { en: data.nameEn, mr: data.nameMr || before?.name.mr || data.nameEn },
      ...(data.symbol === undefined ? {} : { symbol: data.symbol }),
      parentIds,
      // the old "Inside another category" box, which nothing reads any more
      parentId: null,
    };
    const category = data.categoryId
      ? await Category.findOneAndUpdate(
          { _id: data.categoryId },
          { $set: payload },
          { new: true, runValidators: true, session },
        )
      : (await Category.create([payload], { session }))[0];
    if (!category) throw Error("Category not found.");
    if (before && before.slug !== data.slug) {
      await Product.updateMany(
        { categoryId: category._id },
        { $set: { categorySlug: data.slug } },
        { session },
      );
      // and on the products that show here as an extra shelf
      await Product.updateMany({ alsoOn: before.slug }, { $set: { "alsoOn.$": data.slug } }, { session });
    }
    await AuditLog.create(
      [
        {
          actorId,
          action: data.categoryId ? "category.update" : "category.create",
          target: String(category._id),
          details: { before, after: payload },
        },
      ],
      { session },
    );
  });
}

/** "Sort them for me": the shop's own plan (catalog/sections.ts) applied to the subcategories that sit loose. */
export async function sortIntoCategories(actorId: string) {
  await authorize(actorId);
  const result = await groupShelves(true);
  if (result.moves) await AuditLog.create({ actorId, action: "category.sort", target: "categories", details: { done: result.done } });
  return result;
}

export async function updateProductMetadata(actorId: string, input: unknown) {
  await authorize(actorId);
  // the "Provided by" choice; a caller that sends none leaves the provider as it is
  const raw = (input ?? {}) as Record<string, unknown>;
  const providerChosen = "providerId" in raw;
  // the extra shelves it also shows on; a caller that sends none leaves them as they are
  const alsoOnChosen = Array.isArray(raw.alsoOn) ? [...new Set(raw.alsoOn.map(String))] : undefined;
  const data = z
    .object({
      productId: objectId,
      nameEn: z.string().trim().min(2).max(100),
      // English only: Marathi is optional, and an edit without it keeps what's saved (search matches it)
      nameMr: z.string().trim().max(100).optional(),
      descriptionEn: z.string().trim().min(5).max(2000),
      descriptionMr: z.string().trim().max(2000).optional(),
      brand: z.string().trim().max(60),
      categoryId: objectId,
      aliases: z.string().max(1000),
      highlightsEn: z.string().max(2000).default(""),
      highlightsMr: z.string().max(2000).default(""),
      dietaryTags: z.string().max(1000).default(""),
      specifications: z.string().max(5000).default(""),
      featured: z.boolean(),
      bestseller: z.boolean(),
      // printed on school quotations; a blank box clears it
      gstRatePercent: optionalField(gstRateField),
      hsnCode: optionalField(hsnField),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const product = await Product.findOne({ _id: data.productId, ...notDeleted }).session(session);
    const category = await Category.findById(data.categoryId).session(session);
    if (!product || !category) throw Error("Product or category not found.");
    const before = product.toObject();
    const providerId = providerChosen ? await chosenProvider(actorId, raw, session) : product.providerId;
    // its own shelf is never an extra one, also after the product moves to a shelf it was extra on
    const alsoOn = (alsoOnChosen ?? (product.alsoOn as string[]) ?? []).filter((slug) => slug !== category.slug);
    if (alsoOnChosen) {
      if (alsoOn.length > 2) throw Error("Tick at most two extra categories.");
      if ((await Category.countDocuments({ slug: { $in: alsoOn } }).session(session)) !== alsoOn.length)
        throw Error("Category not found.");
    }
    const enHighlights = data.highlightsEn.split("\n").map((item) => item.trim()).filter(Boolean);
    const mrHighlights = data.highlightsMr.split("\n").map((item) => item.trim()).filter(Boolean);
    // "label | value"; the older four-part "label EN | label MR | value EN | value MR" still reads
    const specifications = data.specifications
      .split("\n")
      .map((row) => row.split("|").map((part) => part.trim()))
      .filter((parts) => (parts.length === 2 || parts.length === 4) && parts.every(Boolean))
      .map((parts) => {
        const [labelEn, labelMr, valueEn, valueMr] = parts.length === 2 ? [parts[0], parts[0], parts[1], parts[1]] : parts;
        return { label: { en: labelEn, mr: labelMr }, value: { en: valueEn, mr: valueMr } };
      });
    const after = {
      name: { en: data.nameEn, mr: data.nameMr || product.name.mr || data.nameEn },
      description: { en: data.descriptionEn, mr: data.descriptionMr || product.description.mr || data.descriptionEn },
      brand: data.brand,
      categoryId: category._id,
      categorySlug: category.slug,
      alsoOn,
      providerId,
      aliases: [
        ...new Set(
          data.aliases
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ],
      highlights: Array.from({ length: Math.max(enHighlights.length, mrHighlights.length) }, (_, index) => ({
        en: enHighlights[index] ?? mrHighlights[index] ?? "",
        mr: mrHighlights[index] ?? enHighlights[index] ?? "",
      })).filter((item) => item.en && item.mr),
      dietaryTags: [...new Set(data.dietaryTags.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))],
      specifications,
      featured: data.featured,
      bestseller: data.bestseller,
      gstRatePercent: data.gstRatePercent,
      hsnCode: data.hsnCode,
    };
    product.set(after);
    await product.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: "product.metadata.update",
          target: data.productId,
          details: { before, after },
        },
      ],
      { session },
    );
  });
}

/**
 * A product's photos in a new order, with some removed or links added: the list as it now
 * stands, the first being the cover. Uploads join the list as they happen (storeEvidence).
 */
export async function saveProductPhotos(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z.object({ productId: objectId, images: photoList }).parse(input);
  await mongoose.connection.transaction(async (session) => {
    const product = await Product.findOne({ _id: data.productId, ...notDeleted }).session(session);
    if (!product) throw Error("Product not found.");
    const before = orderedPhotos(product);
    const fields = photoFields(data.images);
    product.images = fields.images;
    product.image = fields.image;
    await product.save({ session });
    await AuditLog.create(
      [{ actorId, action: "product.photos.update", target: data.productId, details: { before, after: fields.images } }],
      { session },
    );
  });
}

/**
 * Take a product out of the shop, or put it back. Hiding used to be a checkbox in the details form
 * that could never be undone; now both ways work, and showing needs at least one pack to sell.
 */
export async function setProductVisibility(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z
    .object({ productId: objectId, visible: z.enum(["show", "hide"]) })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const product = await Product.findOne({ _id: data.productId, ...notDeleted }).session(session);
    if (!product) throw Error("Product not found.");
    const status = data.visible === "show" ? "published" : "draft";
    if (product.status === status) return;
    if (
      status === "published" &&
      !(await ProductVariant.exists({ productId: product._id, active: { $ne: false } }).session(session))
    )
      throw Error("Product has no pack to sell yet. Add or show a pack first.");
    const before = product.status;
    product.status = status;
    await product.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: status === "published" ? "product.show" : "product.hide",
          target: data.productId,
          details: { before, after: status },
        },
      ],
      { session },
    );
  });
}

/**
 * Change a pack's name or per-order limit, or hide it (past orders keep it; nobody can buy it).
 * Price and stock still go through their own approval rules.
 */
export async function updateVariant(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z
    .object({
      variantId: objectId,
      label: z.string().trim().min(1).max(40),
      maxQuantity: z.coerce.number().int().min(1).max(100),
      active: z.boolean(),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const variant = await ProductVariant.findOne({ _id: data.variantId, ...notDeleted }).session(session);
    if (!variant) throw Error("Pack not found.");
    const before = { label: variant.label, maxQuantity: variant.maxQuantity, active: variant.active !== false };
    variant.set({ label: data.label, maxQuantity: data.maxQuantity, active: data.active });
    await variant.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: "variant.update",
          target: data.variantId,
          details: { before, after: { label: data.label, maxQuantity: data.maxQuantity, active: data.active } },
        },
      ],
      { session },
    );
  });
}

/**
 * Who sees a product: shoppers, schools or both. Taking it away from both is what Hide is for,
 * so at least one box stays ticked.
 */
export async function setProductAudience(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z
    .object({ productId: objectId, showToCustomers: z.boolean(), showToSchools: z.boolean() })
    .refine((value) => value.showToCustomers || value.showToSchools, {
      message: "Tick Customers, Schools or both. To take it out of both, use Hide.",
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const product = await Product.findOne({ _id: data.productId, ...notDeleted }).session(session);
    if (!product) throw Error("Product not found.");
    const before = { showToCustomers: product.showToCustomers !== false, showToSchools: product.showToSchools === true };
    const after = { showToCustomers: data.showToCustomers, showToSchools: data.showToSchools };
    if (before.showToCustomers === after.showToCustomers && before.showToSchools === after.showToSchools) return;
    product.set(after);
    await product.save({ session });
    await AuditLog.create(
      [{ actorId, action: "product.audience", target: data.productId, details: { before, after } }],
      { session },
    );
  });
}

/**
 * The price schools see for a pack, before GST. Only an owner sets it, because only an owner
 * prices school quotations; a blank box takes it off ("price on quotation").
 */
export async function setSchoolPrice(actorId: string, input: unknown) {
  await authorize(actorId, "settings:write");
  const data = z
    .object({
      variantId: objectId,
      schoolPricePaise: optionalField(z.coerce.number().int().min(1).max(10_000_000)),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const variant = await ProductVariant.findOne({ _id: data.variantId, ...notDeleted }).session(session);
    if (!variant) throw Error("Pack not found.");
    const before = variant.schoolPricePaise ?? null;
    const after = data.schoolPricePaise ?? null;
    if (before === after) return;
    variant.set({ schoolPricePaise: data.schoolPricePaise });
    await variant.save({ session });
    await AuditLog.create(
      [{ actorId, action: "variant.school-price", target: data.variantId, details: { before, after } }],
      { session },
    );
  });
}

/** When a pack counts as running low: fewer than this can be sold. A blank box goes back to the shop default. */
export async function setAlertLevel(actorId: string, input: unknown) {
  await authorize(actorId, "inventory:adjust");
  const data = z
    .object({ variantId: objectId, alertBelow: optionalField(z.coerce.number().int().min(0).max(100000)) })
    .parse(input);
  const item = await InventoryItem.findOne({ variantId: data.variantId });
  if (!item || !(await ProductVariant.exists({ _id: data.variantId, ...notDeleted }))) throw Error("Pack not found.");
  const before = item.alertBelow ?? null;
  const after = data.alertBelow ?? null;
  if (before === after) return;
  await InventoryItem.updateOne({ _id: item._id }, after === null ? { $unset: { alertBelow: 1 } } : { $set: { alertBelow: after } });
  await AuditLog.create({ actorId, action: "inventory.alert-level", target: data.variantId, details: { before, after } });
}

/**
 * What the shop paid for one pack, for the owners' profit figures. Only an owner sets or sees it;
 * a blank box clears it.
 */
export async function setPackCost(actorId: string, input: unknown) {
  await authorize(actorId, "settings:write");
  const data = z
    .object({ variantId: objectId, costPaise: optionalField(z.coerce.number().int().min(0).max(10_000_000)) })
    .parse(input);
  const variant = await ProductVariant.findOne({ _id: data.variantId, ...notDeleted }).select("+costPaise");
  if (!variant) throw Error("Pack not found.");
  const before = variant.costPaise ?? null;
  const after = data.costPaise ?? null;
  if (before === after) return;
  await ProductVariant.updateOne({ _id: variant._id }, after === null ? { $unset: { costPaise: 1 } } : { $set: { costPaise: after } });
  await AuditLog.create({ actorId, action: "variant.cost", target: data.variantId, details: { before, after } });
}
