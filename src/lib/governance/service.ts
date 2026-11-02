import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import {
  User,
  Product,
  ProductVariant,
  Category,
  InventoryItem,
  AuditLog,
} from "../db/models";
import { InventoryMovement, SystemSetting } from "../commerce/models";
import { objectId } from "../commerce/service";
import { assertPermission, hasPermission, type Permission, type Role } from "../auth/permissions";
import { notify } from "../engagement/service";
import { log } from "../logger";
import { ApprovalRequest, ApprovalHistory } from "./models";
import { gstRateField, hsnField, optionalField } from "../tax/gst";
import { UploadedEvidence } from "../evidence/models";
import { photoFields, photoList } from "../catalog/photos";
import { Provider } from "../providers/models";
import { chosenProvider } from "../providers/service";
import { deletedName, notDeleted } from "../catalog/deleted";

/** Photos chosen for a product waiting for approval are kept this long; a rejected request's then go. */
const PENDING_PHOTO_DAYS = 60;

/** A school price is optional and set before GST; a blank box means "price on quotation". */
const schoolPriceField = optionalField(z.coerce.number().int().min(1).max(10000000));
/** What the shop paid for one pack: owners only, optional. */
const costField = optionalField(z.coerce.number().int().min(0).max(10000000));
async function authorize(id: string, permission: Permission) {
  await connectDB();
  const user = await User.findOne({ _id: objectId.parse(id), active: true });
  if (!user) throw Error("UNAUTHENTICATED");
  assertPermission(user.roles as Role[], permission);
  return user;
}
export const productInput = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    nameEn: z.string().trim().min(2).max(100),
    nameMr: z.string().trim().min(2).max(100),
    descriptionEn: z.string().trim().min(5).max(2000),
    descriptionMr: z.string().trim().min(5).max(2000),
    brand: z.string().trim().max(60),
    categoryId: objectId,
    // another shop that supplies it ("Provided by …"); none means our own stock
    providerId: objectId.optional(),
    aliases: z.string().max(1000),
    sku: z
      .string()
      .regex(/^[A-Za-z\d-]+$/)
      .max(60),
    label: z.string().min(1).max(40),
    unit: z.enum(["piece", "kg", "g", "l", "ml"]),
    packQuantity: z.coerce.number().positive().max(100000),
    pricePaise: z.coerce.number().int().positive().max(10000000),
    mrpPaise: z.coerce.number().int().positive().max(10000000),
    stock: z.coerce.number().int().min(0).max(100000),
    // requests made before schools existed have none of these, and publish as shop-only
    showToCustomers: z.boolean().default(true),
    showToSchools: z.boolean().default(false),
    gstRatePercent: optionalField(gstRateField),
    hsnCode: optionalField(hsnField),
    schoolPricePaise: schoolPriceField,
    costPaise: costField,
    // in order, the first is the cover; requests made before photos could be added have none
    images: photoList.default([]),
  })
  .refine((d) => d.pricePaise <= d.mrpPaise, {
    message: "Price must not exceed MRP",
  })
  .refine((d) => d.showToCustomers || d.showToSchools, {
    message: "Tick Customers, Schools or both, so somebody can see the product.",
  });
export const variantInput = z
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
    schoolPricePaise: schoolPriceField,
    costPaise: costField,
  })
  .refine((value) => value.pricePaise <= value.mrpPaise, {
    message: "Price must not exceed MRP.",
  });

/**
 * An owner's own changes apply at once (still recorded as a request the owner approved): the
 * owners asked not to wait for each other. Changes staff ask for still wait for an owner.
 */
async function isOwner(actorId: string, session?: mongoose.ClientSession) {
  const actor = await User.findById(actorId).select("roles").session(session ?? null);
  return Boolean(actor?.roles.includes("super-admin"));
}
const OWNER_NOTE = "Applied at once: made by an owner.";

/** Records a new request. An owner's is approved and published in the same step; returns whether it is live. */
async function openRequest(
  fields: { kind: string; targetId: unknown; before?: unknown; after: unknown; reason?: string },
  actorId: string,
  session: mongoose.ClientSession,
) {
  const [request] = await ApprovalRequest.create([{ ...fields, requesterId: actorId }], { session });
  await ApprovalHistory.create(
    [{ requestId: request._id, actorId, previous: "draft", next: "pending", comment: fields.reason }],
    { session },
  );
  if (!(await isOwner(actorId, session))) return false;
  request.state = "approved";
  request.reviewerId = actorId;
  request.reviewedAt = new Date();
  request.reason = OWNER_NOTE;
  await request.save({ session });
  await ApprovalHistory.create(
    [{ requestId: request._id, actorId, previous: "pending", next: "approved", comment: OWNER_NOTE }],
    { session },
  );
  await publish(request, actorId, session);
  return true;
}

/** One pending change per pack at a time; say so instead of failing on the database's duplicate check. */
async function assertNothingPending(kind: string, targetId: unknown, session: mongoose.ClientSession) {
  if (await ApprovalRequest.exists({ kind, targetId, state: "pending" }).session(session))
    throw Error(
      `A ${kind === "price" ? "price" : "stock"} change for this pack is already waiting for approval. Withdraw it or wait for the decision.`,
    );
}

/** Taken web addresses and SKUs are caught when the request is made, not later at approval. */
async function assertFree(fields: { slug?: string; sku?: string }, session: mongoose.ClientSession) {
  if (fields.slug) {
    const taken =
      (await Product.exists({ slug: fields.slug }).session(session)) ||
      (await ApprovalRequest.exists({ kind: "product", state: "pending", "after.slug": fields.slug }).session(session));
    if (taken) throw Error(`That web address (${fields.slug}) is already used. Pick another one.`);
  }
  if (fields.sku) {
    const taken =
      (await ProductVariant.exists({ sku: fields.sku }).session(session)) ||
      (await ApprovalRequest.exists({
        kind: { $in: ["product", "variant"] },
        state: "pending",
        "after.sku": fields.sku,
      }).session(session));
    if (taken) throw Error(`That SKU (${fields.sku}) is already used. Pick another one.`);
  }
}

/** Only an owner prices for schools or knows purchase prices, so only an owner can put them on a new pack. */
function assertSchoolPriceAllowed(actor: { roles: unknown }, schoolPricePaise?: number, costPaise?: number) {
  if (schoolPricePaise != null && !hasPermission(actor.roles as Role[], "settings:write"))
    throw Error("Only an owner can set a school price. Leave it blank; the owner can add it later.");
  if (costPaise != null && !hasPermission(actor.roles as Role[], "settings:write"))
    throw Error("Only an owner can set a purchase price. Leave it blank; the owner can add it later.");
}

export async function submitProduct(actorId: string, input: unknown) {
  const actor = await authorize(actorId, "approval:request");
  // the "Provided by" choice can be a shop typed in beside it, added in the same step
  const { providerId: providerChoice, newProviderName, newProviderTown, ...fields } = (input ?? {}) as Record<string, unknown>;
  const data = productInput.parse(fields);
  assertSchoolPriceAllowed(actor, data.schoolPricePaise, data.costPaise);
  if (!(await Category.exists({ _id: data.categoryId })))
    throw Error("Select a category.");
  let live = false;
  await mongoose.connection.transaction(async (session) => {
    await assertFree({ slug: data.slug, sku: data.sku }, session);
    // the photos chosen for it wait as long as the request might
    if (data.images.length)
      await UploadedEvidence.updateMany(
        { url: { $in: data.images }, purpose: "product-draft" },
        { $set: { expiresAt: new Date(Date.now() + PENDING_PHOTO_DAYS * 86400 * 1000) } },
        { session },
      );
    const providerId = await chosenProvider(actorId, { providerId: providerChoice, newProviderName, newProviderTown }, session);
    live = await openRequest(
      { kind: "product", targetId: new mongoose.Types.ObjectId(), after: providerId ? { ...data, providerId } : data },
      actorId,
      session,
    );
  });
  return { live };
}
/** A new pack size follows the same approval as a price change: it puts a price in the shop. */
export async function submitVariant(actorId: string, input: unknown) {
  const actor = await authorize(actorId, "approval:request");
  const data = variantInput.parse(input);
  assertSchoolPriceAllowed(actor, data.schoolPricePaise, data.costPaise);
  let live = false;
  await mongoose.connection.transaction(async (session) => {
    if (!(await Product.exists({ _id: data.productId, ...notDeleted }).session(session)))
      throw Error("Product not found.");
    await assertFree({ sku: data.sku }, session);
    live = await openRequest(
      { kind: "variant", targetId: new mongoose.Types.ObjectId(), after: data },
      actorId,
      session,
    );
  });
  return { live };
}
export async function requestPrice(actorId: string, input: unknown) {
  await authorize(actorId, "approval:request");
  const data = z
    .object({
      variantId: objectId,
      pricePaise: z.coerce.number().int().positive(),
      mrpPaise: z.coerce.number().int().positive(),
    })
    .refine((d) => d.pricePaise <= d.mrpPaise, {
      message: "Price must not exceed MRP.",
      path: ["pricePaise"],
    })
    .parse(input);
  let live = false;
  await mongoose.connection.transaction(async (session) => {
    const variant = await ProductVariant.findOne({ _id: data.variantId, ...notDeleted }).session(session);
    if (!variant) throw Error("This variant is unavailable.");
    await assertNothingPending("price", variant._id, session);
    live = await openRequest(
      {
        kind: "price",
        targetId: variant._id,
        before: { pricePaise: variant.pricePaise, mrpPaise: variant.mrpPaise },
        after: { pricePaise: data.pricePaise, mrpPaise: data.mrpPaise },
      },
      actorId,
      session,
    );
  });
  return { live };
}
async function applyStock(
  actorId: string,
  variantId: unknown,
  delta: number,
  session: mongoose.ClientSession,
) {
  const stock = await InventoryItem.updateOne(
    { variantId, $expr: { $gte: [{ $add: ["$onHand", delta] }, "$reserved"] } },
    { $inc: { onHand: delta } },
    { session },
  );
  if (stock.modifiedCount !== 1)
    throw Error("This adjustment would reduce stock below reservations.");
  await InventoryMovement.create(
    [{ variantId, actorId, quantity: delta, kind: "adjust" }],
    { session },
  );
}
/**
 * Small additions apply at once. Large changes, and anything staff remove, wait for an owner; an
 * owner's own apply at once.
 */
export async function adjustStock(actorId: string, input: unknown) {
  await authorize(actorId, "inventory:adjust");
  const data = z
    .object({
      variantId: objectId,
      delta: z.coerce
        .number()
        .int()
        .min(-100000)
        .max(100000)
        .refine((n) => n !== 0),
      reason: z.string().trim().min(5).max(500),
    })
    .parse(input);
  let outcome: "applied" | "pending" = "applied";
  await mongoose.connection.transaction(async (session) => {
    const setting = await SystemSetting.findOne({
      key: "large-stock-threshold",
    }).session(session);
    const threshold = z
      .number()
      .int()
      .min(1)
      .parse(setting?.value ?? 100);
    const stock = await InventoryItem.findOne({
      variantId: data.variantId,
    }).session(session);
    if (!stock || !(await ProductVariant.exists({ _id: data.variantId, ...notDeleted }).session(session)))
      throw Error("This stock record is unavailable.");
    // said straight away, not when an owner comes to approve it
    if (stock.onHand + data.delta < stock.reserved)
      throw Error("This adjustment would reduce stock below reservations.");
    const owner = await isOwner(actorId, session);
    if (Math.abs(data.delta) >= threshold || (data.delta < 0 && !owner)) {
      await assertNothingPending("stock", data.variantId, session);
      const live = await openRequest(
        {
          kind: "stock",
          targetId: data.variantId,
          before: { onHand: stock.onHand },
          after: { delta: data.delta },
          reason: data.reason,
        },
        actorId,
        session,
      );
      outcome = live ? "applied" : "pending";
    } else {
      await applyStock(actorId, data.variantId, data.delta, session);
      await AuditLog.create(
        [
          {
            actorId,
            action: "inventory.adjust",
            target: data.variantId,
            details: { delta: data.delta, reason: data.reason },
          },
        ],
        { session },
      );
    }
  });
  return { outcome };
}

const WHAT_IS_DELETED = { "delete-pack": "pack", "delete-product": "product" } as const;
type DeleteKind = keyof typeof WHAT_IS_DELETED;

/** Stock held for open orders can't go: those orders still have to be packed from it. */
async function assertNothingHeld(packs: { _id: unknown }[], session: mongoose.ClientSession) {
  const stock = await InventoryItem.find({ variantId: { $in: packs.map((pack) => pack._id) } })
    .select("reserved")
    .session(session);
  const held = stock.reduce((sum, item) => sum + item.reserved, 0);
  if (held > 0)
    throw Error(`${held} ${held === 1 ? "is" : "are"} held for open orders. Deliver or cancel those orders first.`);
}

/** The packs a delete takes with it; refuses what is already gone. */
async function packsDeletedBy(kind: DeleteKind, targetId: unknown, session: mongoose.ClientSession) {
  if (kind === "delete-pack") {
    const packs = await ProductVariant.find({ _id: targetId, ...notDeleted }).session(session);
    if (!packs.length) throw Error("This pack was already deleted.");
    return packs;
  }
  if (!(await Product.exists({ _id: targetId, ...notDeleted }).session(session)))
    throw Error("This product was already deleted.");
  return ProductVariant.find({ productId: targetId, ...notDeleted }).session(session);
}

/**
 * Deletes a pack, or a product with its packs. They are kept for past orders and bills; hiding them
 * is what takes them out of the shop, baskets and checkout (catalog/deleted.ts).
 */
async function applyDelete(kind: DeleteKind, targetId: unknown, actorId: string, session: mongoose.ClientSession) {
  const packs = await packsDeletedBy(kind, targetId, session);
  await assertNothingHeld(packs, session);
  const deletedAt = new Date();
  for (const pack of packs) {
    const stock = await InventoryItem.findOne({ variantId: pack._id }).session(session);
    if (stock?.onHand) await applyStock(actorId, pack._id, -stock.onHand, session);
    // 0 never warns: the empty record stops counting as sold out on the overview and in reports
    await InventoryItem.updateOne({ variantId: pack._id }, { $set: { alertBelow: 0 } }, { session });
    pack.set({ active: false, deletedAt, sku: deletedName(pack.sku, pack._id) });
    await pack.save({ session });
  }
  if (kind === "delete-product") {
    const product = await Product.findById(targetId).session(session);
    product.set({ status: "draft", deletedAt, slug: deletedName(product.slug, product._id) });
    await product.save({ session });
  }
  // what was still waiting for these can't happen any more
  const stale = await ApprovalRequest.find({
    state: "pending",
    $or: [
      { kind: { $in: ["price", "stock", "delete-pack"] }, targetId: { $in: packs.map((pack) => pack._id) } },
      ...(kind === "delete-product" ? [{ kind: "variant", "after.productId": String(targetId) }] : []),
    ],
  }).session(session);
  if (stale.length) {
    await ApprovalRequest.updateMany({ _id: { $in: stale.map((r) => r._id) } }, { $set: { state: "withdrawn" } }, { session });
    await ApprovalHistory.create(
      stale.map((r) => ({
        requestId: r._id,
        actorId,
        previous: "pending",
        next: "withdrawn",
        comment: `The ${WHAT_IS_DELETED[kind]} was deleted.`,
      })),
      { session, ordered: true },
    );
  }
}

/** Delete a pack or a product: an owner's happens at once, anyone else's waits for an owner. */
export async function requestDelete(actorId: string, input: unknown) {
  await authorize(actorId, "approval:request");
  const data = z
    .object({
      target: z.enum(["pack", "product"]),
      targetId: objectId,
      reason: z.string().trim().max(500).default(""),
    })
    .parse(input);
  const kind: DeleteKind = data.target === "pack" ? "delete-pack" : "delete-product";
  let live = false;
  await mongoose.connection.transaction(async (session) => {
    const owner = await isOwner(actorId, session);
    if (!owner && data.reason.length < 5) throw Error("Say why it should go (5 letters or more), so the owner can decide.");
    const packs = await packsDeletedBy(kind, data.targetId, session);
    await assertNothingHeld(packs, session);
    if (await ApprovalRequest.exists({ kind, targetId: data.targetId, state: "pending" }).session(session))
      throw Error(`A request to delete this ${data.target} is already waiting for an owner.`);
    const stock = await InventoryItem.find({ variantId: { $in: packs.map((pack) => pack._id) } }).select("onHand").session(session);
    const onHand = stock.reduce((sum, item) => sum + item.onHand, 0);
    const name =
      kind === "delete-pack"
        ? { label: packs[0].label, sku: packs[0].sku }
        : { nameEn: (await Product.findById(data.targetId).select("name").session(session)).name.en, packs: packs.length };
    live = await openRequest(
      { kind, targetId: data.targetId, before: { ...name, onHand }, after: { deleted: true }, reason: data.reason || undefined },
      actorId,
      session,
    );
  });
  return { live };
}
async function createPack(
  data: z.infer<typeof variantInput> | z.infer<typeof productInput>,
  productId: unknown,
  variantId: unknown,
  actorId: string,
  session: mongoose.ClientSession,
) {
  const [v] = await ProductVariant.create(
    [
      {
        _id: variantId,
        productId,
        sku: data.sku,
        label: data.label,
        unit: data.unit,
        packQuantity: data.packQuantity,
        pricePaise: data.pricePaise,
        mrpPaise: data.mrpPaise,
        ...("maxQuantity" in data ? { maxQuantity: data.maxQuantity } : {}),
        ...(data.schoolPricePaise != null ? { schoolPricePaise: data.schoolPricePaise } : {}),
        ...(data.costPaise != null ? { costPaise: data.costPaise } : {}),
      },
    ],
    { session },
  );
  await InventoryItem.create([{ variantId: v._id, onHand: data.stock, reserved: 0 }], { session });
  await InventoryMovement.create(
    [{ variantId: v._id, actorId, quantity: data.stock, kind: "adjust" }],
    { session },
  );
  return v;
}
async function publish(
  request: mongoose.Document & Record<string, unknown>,
  actorId: string,
  session: mongoose.ClientSession,
) {
  const kind = String(request.kind);
  const after = request.after as Record<string, unknown>;
  const before = request.before as Record<string, unknown> | undefined;
  if (kind === "product") {
    const data = productInput.parse(after);
    const category = await Category.findById(data.categoryId).session(session);
    if (!category) throw Error("Category no longer exists");
    // an item never goes live looking like our own while its provider still waits for an owner
    if (data.providerId) {
      const provider = await Provider.findById(data.providerId).select("name status").session(session);
      if (!provider) throw Error("The provider of this product no longer exists. Ask for it again with another provider.");
      if (provider.status !== "active") throw Error(`Approve the provider ${provider.name} first, on the Providers page.`);
    }
    const [p] = await Product.create(
      [
        {
          _id: request.targetId,
          slug: data.slug,
          name: { en: data.nameEn, mr: data.nameMr },
          description: { en: data.descriptionEn, mr: data.descriptionMr },
          brand: data.brand,
          categoryId: category._id,
          categorySlug: category.slug,
          ...(data.providerId ? { providerId: data.providerId } : {}),
          aliases: data.aliases
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          status: "published",
          showToCustomers: data.showToCustomers,
          showToSchools: data.showToSchools,
          ...(data.gstRatePercent != null ? { gstRatePercent: data.gstRatePercent } : {}),
          ...(data.hsnCode ? { hsnCode: data.hsnCode } : {}),
          ...(data.images.length ? photoFields(data.images) : {}),
        },
      ],
      { session },
    );
    // the photos chosen on Add product become the product's own, shown to everyone and kept for good
    if (data.images.length)
      await UploadedEvidence.updateMany(
        { url: { $in: data.images }, purpose: "product-draft" },
        { $set: { purpose: "product", productId: p._id }, $unset: { expiresAt: 1 } },
        { session },
      );
    await createPack(data, p._id, new mongoose.Types.ObjectId(), actorId, session);
  } else if (kind === "variant") {
    const data = variantInput.parse(after);
    if (!(await Product.exists({ _id: data.productId, ...notDeleted }).session(session)))
      throw Error("Product not found.");
    await createPack(data, data.productId, request.targetId, actorId, session);
  } else if (kind === "delete-pack" || kind === "delete-product") {
    await applyDelete(kind, request.targetId, actorId, session);
  } else if (!(await ProductVariant.exists({ _id: request.targetId, ...notDeleted }).session(session))) {
    throw Error("This pack was deleted, so the change can't be applied.");
  } else if (kind === "price") {
    const result = await ProductVariant.updateOne(
      {
        _id: request.targetId,
        pricePaise: before?.pricePaise,
        mrpPaise: before?.mrpPaise,
      },
      { $set: { pricePaise: after.pricePaise, mrpPaise: after.mrpPaise } },
      { session, runValidators: true },
    );
    if (result.modifiedCount !== 1)
      throw Error("Prices changed since this request. Submit a fresh request.");
  } else {
    // the change is relative ("+100 delivered"), so sales in between don't make it wrong;
    // applyStock still refuses to take stock below what open orders hold
    await applyStock(actorId, request.targetId, Number(after.delta), session);
  }
  request.state = "published";
  request.publishedAt = new Date();
  await request.save({ session });
  await ApprovalHistory.create(
    [
      {
        requestId: request._id,
        actorId,
        previous: "approved",
        next: "published",
      },
    ],
    { session },
  );
  await AuditLog.create(
    [
      {
        actorId,
        action: `approval.publish.${kind}`,
        target: String(request.targetId),
        details: { before, after },
      },
    ],
    { session },
  );
}
const KIND_NAMES: Record<string, string> = {
  product: "new product",
  variant: "new pack size",
  price: "price change",
  stock: "stock change",
  "delete-pack": "request to delete a pack",
  "delete-product": "request to delete a product",
};
function describe(request: { kind: string; after: Record<string, unknown> }) {
  const what = KIND_NAMES[request.kind] ?? "change";
  return request.kind === "product" && request.after.nameEn
    ? `${what} “${String(request.after.nameEn)}”`
    : what;
}
export async function reviewApproval(actorId: string, input: unknown) {
  await authorize(actorId, "approval:review");
  const data = z
    .object({
      requestId: objectId,
      decision: z.enum(["approved", "rejected"]),
      comment: z.string().trim().max(500),
      scheduledAt: z.string().optional(),
    })
    .parse(input);
  if (data.decision === "rejected" && data.comment.length < 5)
    throw Error("A rejection reason is required.");
  const scheduledAt = data.scheduledAt
    ? z.coerce.date().parse(data.scheduledAt)
    : undefined;
  let decided: { requesterId: unknown; kind: string; after: Record<string, unknown> } | null = null;
  await mongoose.connection.transaction(async (session) => {
    const request = await ApprovalRequest.findOne({
      _id: data.requestId,
      state: "pending",
    }).session(session);
    if (!request) throw Error("This request has already been reviewed.");
    request.state = data.decision;
    request.reviewerId = actorId;
    request.reviewedAt = new Date();
    request.reason = data.comment;
    if (scheduledAt) request.scheduledAt = scheduledAt;
    await request.save({ session });
    await ApprovalHistory.create(
      [
        {
          requestId: request._id,
          actorId,
          previous: "pending",
          next: data.decision,
          comment: data.comment,
        },
      ],
      { session },
    );
    if (
      data.decision === "approved" &&
      (!scheduledAt || scheduledAt.getTime() <= Date.now())
    )
      await publish(request, actorId, session);
    decided = { requesterId: request.requesterId, kind: request.kind, after: request.after };
  });
  // the person who asked finds out, instead of checking back
  const result = decided as { requesterId: unknown; kind: string; after: Record<string, unknown> } | null;
  if (result && String(result.requesterId) !== actorId) {
    const what = describe(result);
    await notify({
      userId: result.requesterId,
      type: "system",
      title:
        data.decision === "rejected"
          ? `Your ${what} was not approved`
          : scheduledAt && scheduledAt.getTime() > Date.now()
            ? `Your ${what} was approved for later`
            : result.kind in WHAT_IS_DELETED
              ? `Your ${what} was approved`
              : `Your ${what} is live`,
      body:
        data.decision === "rejected"
          ? `Reason: ${data.comment}`
          : data.comment || "An owner approved it.",
      href: result.kind === "stock" ? "/admin/inventory" : "/admin/products",
    }).catch((error) => log("warn", "approval.notify-failed", { error }));
  }
}
/** The person who asked (or an owner) takes back a change that is still waiting. */
export async function withdrawRequest(actorId: string, input: unknown) {
  const actor = await authorize(actorId, "profile:own");
  const requestId = objectId.parse(input);
  await mongoose.connection.transaction(async (session) => {
    const request = await ApprovalRequest.findOne({ _id: requestId, state: "pending" }).session(session);
    if (!request) throw Error("This request has already been reviewed.");
    const mayReview = hasPermission(actor.roles as Role[], "approval:review");
    if (String(request.requesterId) !== actorId && !mayReview)
      throw Error("Only the person who asked, or an owner, can withdraw this request.");
    request.state = "withdrawn";
    await request.save({ session });
    await ApprovalHistory.create(
      [{ requestId: request._id, actorId, previous: "pending", next: "withdrawn" }],
      { session },
    );
  });
}
/**
 * Publishes approved changes whose time has come. Each one is handled on its own: one that can't
 * be applied any more (a price changed meanwhile, the approver left) is marked failed with the
 * reason and the people involved are told, instead of stopping every later change.
 */
export async function publishScheduled() {
  await connectDB();
  const requests = await ApprovalRequest.find({
    state: "approved",
    scheduledAt: { $lte: new Date() },
  }).limit(100);
  let published = 0;
  for (const r of requests) {
    try {
      await authorize(String(r.reviewerId), "approval:review");
      await mongoose.connection.transaction(async (session) => {
        const current = await ApprovalRequest.findOne({
          _id: r._id,
          state: "approved",
          scheduledAt: { $lte: new Date() },
        }).session(session);
        if (current) await publish(current, String(current.reviewerId), session);
      });
      published++;
    } catch (error) {
      const reason =
        error instanceof Error && /^(UNAUTHENTICATED|FORBIDDEN)$/.test(error.message)
          ? "The owner who approved it can no longer approve changes."
          : error instanceof Error
            ? error.message
            : "It could not be applied.";
      await ApprovalRequest.updateOne(
        { _id: r._id, state: "approved" },
        { $set: { state: "failed", failureReason: reason } },
      );
      await ApprovalHistory.create({
        requestId: r._id,
        actorId: r.reviewerId,
        previous: "approved",
        next: "failed",
        comment: reason,
      });
      log("warn", "approval.scheduled-failed", { requestId: String(r._id), reason });
      for (const userId of new Set([String(r.requesterId), String(r.reviewerId)]))
        await notify({
          userId,
          type: "system",
          title: `A scheduled ${describe(r)} could not be applied`,
          body: `${reason} Send a fresh request if it is still needed.`,
          href: "/super-admin/approvals",
        }).catch(() => undefined);
    }
  }
  return published;
}
