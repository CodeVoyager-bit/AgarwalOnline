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
import { assertPermission, type Permission } from "../auth/permissions";
import { ApprovalRequest, ApprovalHistory } from "./models";
async function authorize(id: string, permission: Permission) {
  await connectDB();
  const user = await User.findOne({ _id: objectId.parse(id), active: true });
  if (!user) throw Error("UNAUTHENTICATED");
  assertPermission(user.role, permission);
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
  })
  .refine((d) => d.pricePaise <= d.mrpPaise, {
    message: "Price must not exceed MRP",
  });
export async function submitProduct(actorId: string, input: unknown) {
  await authorize(actorId, "approval:request");
  const data = productInput.parse(input);
  if (!(await Category.exists({ _id: data.categoryId })))
    throw Error("Select a category.");
  await mongoose.connection.transaction(async (session) => {
    const [request] = await ApprovalRequest.create(
      [
        {
          kind: "product",
          targetId: new mongoose.Types.ObjectId(),
          requesterId: actorId,
          after: data,
        },
      ],
      { session },
    );
    await ApprovalHistory.create(
      [{ requestId: request._id, actorId, previous: "draft", next: "pending" }],
      { session },
    );
  });
}
export async function requestPrice(actorId: string, input: unknown) {
  await authorize(actorId, "approval:request");
  const data = z
    .object({
      variantId: objectId,
      pricePaise: z.coerce.number().int().positive(),
      mrpPaise: z.coerce.number().int().positive(),
    })
    .refine((d) => d.pricePaise <= d.mrpPaise)
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const variant = await ProductVariant.findById(data.variantId).session(
      session,
    );
    if (!variant) throw Error("This variant is unavailable.");
    const [request] = await ApprovalRequest.create(
      [
        {
          kind: "price",
          targetId: variant._id,
          requesterId: actorId,
          before: {
            pricePaise: variant.pricePaise,
            mrpPaise: variant.mrpPaise,
          },
          after: { pricePaise: data.pricePaise, mrpPaise: data.mrpPaise },
        },
      ],
      { session },
    );
    await ApprovalHistory.create(
      [{ requestId: request._id, actorId, previous: "draft", next: "pending" }],
      { session },
    );
  });
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
    if (!stock) throw Error("This stock record is unavailable.");
    if (Math.abs(data.delta) >= threshold) {
      const [request] = await ApprovalRequest.create(
        [
          {
            kind: "stock",
            targetId: data.variantId,
            requesterId: actorId,
            before: { onHand: stock.onHand },
            after: { delta: data.delta },
            reason: data.reason,
          },
        ],
        { session },
      );
      await ApprovalHistory.create(
        [
          {
            requestId: request._id,
            actorId,
            previous: "draft",
            next: "pending",
            comment: data.reason,
          },
        ],
        { session },
      );
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
          aliases: data.aliases
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          status: "published",
        },
      ],
      { session },
    );
    const [v] = await ProductVariant.create(
      [
        {
          productId: p._id,
          sku: data.sku,
          label: data.label,
          unit: data.unit,
          packQuantity: data.packQuantity,
          pricePaise: data.pricePaise,
          mrpPaise: data.mrpPaise,
        },
      ],
      { session },
    );
    await InventoryItem.create(
      [{ variantId: v._id, onHand: data.stock, reserved: 0 }],
      { session },
    );
    await InventoryMovement.create(
      [{ variantId: v._id, actorId, quantity: data.stock, kind: "adjust" }],
      { session },
    );
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
    const stock = await InventoryItem.findOne({
      variantId: request.targetId,
      onHand: before?.onHand,
    }).session(session);
    if (!stock)
      throw Error("Stock changed since this request. Submit a fresh request.");
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
  await mongoose.connection.transaction(async (session) => {
    const request = await ApprovalRequest.findOne({
      _id: data.requestId,
      state: "pending",
    }).session(session);
    if (!request) throw Error("This request has already been reviewed.");
    if (String(request.requesterId) === actorId)
      throw Error("You cannot approve or reject your own request.");
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
  });
}
export async function publishScheduled() {
  await connectDB();
  const requests = await ApprovalRequest.find({
    state: "approved",
    scheduledAt: { $lte: new Date() },
  }).limit(100);
  for (const r of requests) {
    await authorize(String(r.reviewerId), "approval:review");
    await mongoose.connection.transaction(async (session) => {
      const current = await ApprovalRequest.findOne({
        _id: r._id,
        state: "approved",
        scheduledAt: { $lte: new Date() },
      }).session(session);
      if (current) await publish(current, String(current.reviewerId), session);
    });
  }
  return requests.length;
}
