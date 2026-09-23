import mongoose from "mongoose";
import { z } from "zod";
import { assertPermission } from "../auth/permissions";
import { connectDB } from "../db/connect";
import {
  AuditLog,
  Category,
  InventoryItem,
  Product,
  ProductVariant,
  User,
} from "../db/models";
import { InventoryMovement } from "../commerce/models";
import { objectId } from "../commerce/service";

async function authorize(actorId: string) {
  await connectDB();
  const actor = await User.findOne({
    _id: objectId.parse(actorId),
    active: true,
  });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.role, "catalog:write");
}

const categoryInput = z.object({
  categoryId: objectId.optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(60),
  nameEn: z.string().trim().min(2).max(80),
  nameMr: z.string().trim().min(2).max(80),
  symbol: z.string().trim().max(12).default(""),
  parentId: z.union([objectId, z.literal("")]).optional(),
});

export async function saveCategory(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = categoryInput.parse(input);
  if (data.parentId && data.parentId === data.categoryId)
    throw Error("A category cannot be its own parent.");
  await mongoose.connection.transaction(async (session) => {
    if (
      data.parentId &&
      !(await Category.exists({ _id: data.parentId }).session(session))
    )
      throw Error("Parent category not found.");
    const payload = {
      slug: data.slug,
      name: { en: data.nameEn, mr: data.nameMr },
      symbol: data.symbol,
      ...(data.parentId ? { parentId: data.parentId } : { parentId: null }),
    };
    const before = data.categoryId
      ? await Category.findById(data.categoryId).session(session).lean()
      : null;
    const category = data.categoryId
      ? await Category.findOneAndUpdate(
          { _id: data.categoryId },
          { $set: payload },
          { new: true, runValidators: true, session },
        )
      : (await Category.create([payload], { session }))[0];
    if (!category) throw Error("Category not found.");
    if (before && before.slug !== data.slug)
      await Product.updateMany(
        { categoryId: category._id },
        { $set: { categorySlug: data.slug } },
        { session },
      );
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

export async function updateProductMetadata(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z
    .object({
      productId: objectId,
      nameEn: z.string().trim().min(2).max(100),
      nameMr: z.string().trim().min(2).max(100),
      descriptionEn: z.string().trim().min(5).max(2000),
      descriptionMr: z.string().trim().min(5).max(2000),
      brand: z.string().trim().max(60),
      categoryId: objectId,
      aliases: z.string().max(1000),
      images: z.string().max(5000).default(""),
      highlightsEn: z.string().max(2000).default(""),
      highlightsMr: z.string().max(2000).default(""),
      dietaryTags: z.string().max(1000).default(""),
      specifications: z.string().max(5000).default(""),
      featured: z.boolean(),
      bestseller: z.boolean(),
      published: z.boolean(),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const product = await Product.findById(data.productId).session(session);
    const category = await Category.findById(data.categoryId).session(session);
    if (!product || !category) throw Error("Product or category not found.");
    if (product.status !== "published" && data.published)
      throw Error("A draft product must use the approval workflow.");
    const before = product.toObject();
    const enHighlights = data.highlightsEn.split("\n").map((item) => item.trim()).filter(Boolean);
    const mrHighlights = data.highlightsMr.split("\n").map((item) => item.trim()).filter(Boolean);
    const specifications = data.specifications
      .split("\n")
      .map((row) => row.split("|").map((part) => part.trim()))
      .filter((parts) => parts.length === 4 && parts.every(Boolean))
      .map(([labelEn, labelMr, valueEn, valueMr]) => ({
        label: { en: labelEn, mr: labelMr },
        value: { en: valueEn, mr: valueMr },
      }));
    const after = {
      name: { en: data.nameEn, mr: data.nameMr },
      description: { en: data.descriptionEn, mr: data.descriptionMr },
      brand: data.brand,
      categoryId: category._id,
      categorySlug: category.slug,
      aliases: [
        ...new Set(
          data.aliases
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ],
      images: data.images.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 8),
      highlights: Array.from({ length: Math.max(enHighlights.length, mrHighlights.length) }, (_, index) => ({
        en: enHighlights[index] ?? mrHighlights[index] ?? "",
        mr: mrHighlights[index] ?? enHighlights[index] ?? "",
      })).filter((item) => item.en && item.mr),
      dietaryTags: [...new Set(data.dietaryTags.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))],
      specifications,
      featured: data.featured,
      bestseller: data.bestseller,
      status: data.published ? "published" : "draft",
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

export async function createVariant(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z
    .object({
      productId: objectId,
      sku: z
        .string()
        .trim()
        .regex(/^[A-Za-z\d-]+$/)
        .max(60),
      label: z.string().trim().min(1).max(40),
      unit: z.enum(["piece", "kg", "g", "l", "ml"]),
      packQuantity: z.coerce.number().positive().max(100000),
      pricePaise: z.coerce.number().int().positive().max(10000000),
      mrpPaise: z.coerce.number().int().positive().max(10000000),
      maxQuantity: z.coerce.number().int().min(1).max(100),
      stock: z.coerce.number().int().min(0).max(100000),
    })
    .refine((value) => value.pricePaise <= value.mrpPaise, {
      message: "Price must not exceed MRP.",
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    if (
      !(await Product.exists({
        _id: data.productId,
        status: "published",
      }).session(session))
    )
      throw Error("Add variants only to approved products.");
    const [variant] = await ProductVariant.create(
      [
        {
          productId: data.productId,
          sku: data.sku,
          label: data.label,
          unit: data.unit,
          packQuantity: data.packQuantity,
          pricePaise: data.pricePaise,
          mrpPaise: data.mrpPaise,
          maxQuantity: data.maxQuantity,
        },
      ],
      { session },
    );
    await InventoryItem.create(
      [{ variantId: variant._id, onHand: data.stock }],
      { session },
    );
    await InventoryMovement.create(
      [
        {
          variantId: variant._id,
          actorId,
          quantity: data.stock,
          kind: "adjust",
        },
      ],
      { session },
    );
    await AuditLog.create(
      [
        {
          actorId,
          action: "variant.create",
          target: String(variant._id),
          details: data,
        },
      ],
      { session },
    );
  });
}
