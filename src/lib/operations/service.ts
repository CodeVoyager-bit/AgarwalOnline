import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { User, OTPChallenge, InventoryItem, AuditLog } from "../db/models";
import {
  Order,
  OrderTimelineEvent,
  InventoryReservation,
  InventoryMovement,
} from "../commerce/models";
import { objectId } from "../commerce/service";
import {
  assertPermission,
  type Permission,
  type Role,
} from "../auth/permissions";
import { PackingChecklist, CODCollection, DeliveryAttempt } from "./models";
import { assertTransition, type Dimension } from "./transitions";
import { digest, otpCode, otpDigest, equalHash } from "../auth/crypto";
import { getEnv } from "../env";
import { rateLimit } from "../auth/rate-limit";
import { notify } from "../engagement/service";
async function actor(id: string, permission: Permission) {
  await connectDB();
  const user = await User.findOne({ _id: objectId.parse(id), active: true });
  if (!user) throw Error("UNAUTHENTICATED");
  assertPermission(user.role as Role, permission);
  return user;
}
async function timeline(
  orderId: unknown,
  actorId: string,
  dimension: Dimension | "cod" | "payment",
  previous: string,
  next: string,
  session: mongoose.ClientSession,
  notes?: string,
) {
  await OrderTimelineEvent.create(
    [{ orderId, actorId, dimension, previous, next, notes }],
    { session },
  );
}
export async function changeOrderStatus(actorId: string, input: unknown) {
  await actor(actorId, "order:manage");
  const data = z
    .object({
      orderId: objectId,
      dimension: z.enum(["order", "fulfilment"]),
      next: z.string().max(30),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findById(data.orderId).session(session);
    if (!order) throw Error("This order does not exist.");
    const field =
      data.dimension === "order" ? "orderStatus" : "fulfilmentStatus";
    assertTransition(data.dimension, order[field], data.next);
    if (
      data.dimension === "order" &&
      data.next !== "confirmed" &&
      data.next !== "completed"
    )
      throw Error("This operation is unavailable.");
    if (order.orderStatus === "cancelled")
      throw Error("This order is cancelled.");
    if (order.paymentMethod === "razorpay" && order.paymentStatus !== "paid")
      throw Error("This order has not been paid.");
    if (data.dimension === "fulfilment" && order.orderStatus !== "confirmed")
      throw Error("Confirm the order before packing.");
    if (data.dimension === "fulfilment" && data.next === "packed") {
      const checklist = await PackingChecklist.findOne({
        orderId: order._id,
        completedAt: { $exists: true },
      }).session(session);
      if (!checklist) throw Error("Complete every packing item first.");
    }
    if (
      data.dimension === "order" &&
      data.next === "completed" &&
      order.deliveryStatus !== "delivered"
    )
      throw Error("Delivery must be verified first.");
    const previous = order[field];
    order[field] = data.next;
    await order.save({ session });
    await timeline(
      order._id,
      actorId,
      data.dimension,
      previous,
      data.next,
      session,
    );
    await notify(
      {
        userId: order.customerId,
        type: "order",
        title:
          data.next === "confirmed" ? "Order confirmed" : "Order completed",
        body:
          data.next === "confirmed"
            ? `${order.number} is now being prepared.`
            : `${order.number} is complete. Thank you for shopping local.`,
        href: `/account/orders/${order._id}`,
      },
      session,
    );
  });
}
export async function savePacking(actorId: string, input: unknown) {
  await actor(actorId, "packing:write");
  const data = z
    .object({
      orderId: objectId,
      items: z
        .array(
          z.object({
            variantId: objectId,
            packedQuantity: z.number().int().min(0).max(100),
            missing: z.boolean(),
            substitution: z.string().trim().max(120).default(""),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({
      _id: data.orderId,
      orderStatus: "confirmed",
      fulfilmentStatus: "picking",
    }).session(session);
    if (!order) throw Error("This order is not in the picking queue.");
    if (
      data.items.length !== order.items.length ||
      new Set(data.items.map((i) => i.variantId)).size !== data.items.length
    )
      throw Error("Check every item exactly once.");
    let complete = true;
    for (const item of data.items) {
      const expected = order.items.find(
        (i: { variantId: unknown }) => String(i.variantId) === item.variantId,
      );
      if (!expected || item.packedQuantity > expected.quantity)
        throw Error("Packed quantity does not match this order.");
      if (
        (item.missing || item.packedQuantity !== expected.quantity) &&
        !item.substitution
      )
        complete = false;
    }
    await PackingChecklist.updateOne(
      { orderId: data.orderId },
      {
        $set: {
          packerId: actorId,
          items: data.items,
          ...(complete ? { completedAt: new Date() } : {}),
        },
        ...(!complete ? { $unset: { completedAt: 1 } } : {}),
      },
      { upsert: true, session },
    );
    await AuditLog.create(
      [
        {
          actorId,
          action: "packing.checklist",
          target: data.orderId,
          details: { complete, items: data.items },
        },
      ],
      { session },
    );
  });
}
export async function assignDelivery(actorId: string, input: unknown) {
  await actor(actorId, "delivery:assign");
  const data = z
    .object({ orderId: objectId, partnerId: objectId })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const partner = await User.exists({
      _id: data.partnerId,
      role: "delivery",
      active: true,
    }).session(session);
    if (!partner) throw Error("Select an active delivery partner.");
    const order = await Order.findOne({
      _id: data.orderId,
      orderStatus: "confirmed",
      fulfilmentStatus: "ready",
      deliveryStatus: "unassigned",
    }).session(session);
    if (!order) throw Error("This order is not ready for assignment.");
    order.assignedTo = data.partnerId;
    order.deliveryStatus = "assigned";
    await order.save({ session });
    await timeline(
      order._id,
      actorId,
      "delivery",
      "unassigned",
      "assigned",
      session,
    );
    await notify(
      {
        userId: order.customerId,
        type: "delivery",
        title: "Delivery partner assigned",
        body: `${order.number} is ready and has been assigned for delivery.`,
        href: `/account/orders/${order._id}`,
      },
      session,
    );
  });
}
export async function partnerTransition(actorId: string, input: unknown) {
  await actor(actorId, "delivery:assigned");
  const data = z
    .object({
      orderId: objectId,
      next: z.enum(["out-for-delivery", "attempted", "failed"]),
      reason: z.string().max(500).default(""),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({
      _id: data.orderId,
      assignedTo: actorId,
      orderStatus: "confirmed",
    }).session(session);
    if (!order) throw Error("This delivery is not assigned to you.");
    assertTransition("delivery", order.deliveryStatus, data.next);
    if (
      ["attempted", "failed"].includes(data.next) &&
      data.reason.trim().length < 5
    )
      throw Error("Enter the reason this delivery could not be completed.");
    if (["attempted", "failed"].includes(data.next))
      await DeliveryAttempt.create(
        [{ orderId: order._id, partnerId: actorId, reason: data.reason }],
        { session },
      );
    const previous = order.deliveryStatus;
    order.deliveryStatus = data.next;
    await order.save({ session });
    await timeline(
      order._id,
      actorId,
      "delivery",
      previous,
      data.next,
      session,
      data.reason,
    );
    await notify(
      {
        userId: order.customerId,
        type: "delivery",
        title:
          data.next === "out-for-delivery"
            ? "Your order is on the way"
            : "Delivery needs your attention",
        body:
          data.next === "out-for-delivery"
            ? `${order.number} is out for delivery.`
            : `${order.number}: ${data.reason}`,
        href: `/account/orders/${order._id}`,
      },
      session,
    );
  });
}

export async function resolveCODDiscrepancy(actorId: string, input: unknown) {
  await actor(actorId, "cod:reconcile");
  const data = z
    .object({
      orderId: objectId,
      resolution: z.string().trim().min(5).max(500),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const collection = await CODCollection.findOne({
      orderId: data.orderId,
      reconciledAt: { $exists: true },
      discrepancyPaise: { $ne: 0 },
      discrepancyResolvedAt: null,
    }).session(session);
    if (!collection)
      throw Error("This discrepancy is already resolved or unavailable.");
    collection.discrepancyResolution = data.resolution;
    collection.discrepancyResolvedBy = actorId;
    collection.discrepancyResolvedAt = new Date();
    await collection.save({ session });
    await Order.updateOne(
      { _id: data.orderId },
      { $set: { codStatus: "reconciled" } },
      { session },
    );
    await timeline(
      data.orderId,
      actorId,
      "cod",
      "discrepancy",
      "reconciled",
      session,
      data.resolution,
    );
    await AuditLog.create(
      [
        {
          actorId,
          action: "cod.discrepancy.resolve",
          target: data.orderId,
          details: {
            discrepancyPaise: collection.discrepancyPaise,
            resolution: data.resolution,
          },
        },
      ],
      { session },
    );
  });
}
export async function requestDeliveryOTP(
  customerId: string,
  orderInput: unknown,
) {
  await actor(customerId, "order:own");
  const id = objectId.parse(orderInput);
  const order = await Order.findOne({
    _id: id,
    customerId,
    orderStatus: "confirmed",
    deliveryStatus: "out-for-delivery",
  });
  if (!order)
    throw Error(
      "A delivery code is available when your order is out for delivery.",
    );
  await rateLimit(`delivery-code:${id}`, 3);
  const env = getEnv();
  const code = env.MOCK_OTP === "true" ? env.MOCK_OTP_CODE : otpCode();
  const subjectHash = digest(`delivery:${id}`);
  await OTPChallenge.updateMany(
    { subjectHash, purpose: "delivery", consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  const challenge = await OTPChallenge.create({
    subjectHash,
    purpose: "delivery",
    codeHash: otpDigest(subjectHash, code, env.AUTH_SECRET),
    expiresAt: new Date(Date.now() + 5 * 60000),
  });
  if (env.MOCK_OTP !== "true") {
    if (!env.SMS_API_URL || !env.SMS_API_TOKEN)
      throw Error("SMS delivery is unavailable.");
    const response = await fetch(env.SMS_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SMS_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: `+91${order.address.phone}`,
        message: `Your delivery confirmation code for ${order.number} is ${code}. Share only after receiving your order.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      await OTPChallenge.deleteOne({ _id: challenge._id });
      throw Error("Unable to send delivery code.");
    }
  }
  return env.MOCK_OTP === "true"
    ? `Development delivery code: ${code}`
    : "Delivery code sent to your address contact number.";
}
export async function completeDelivery(actorId: string, input: unknown) {
  await actor(actorId, "delivery:assigned");
  const data = z
    .object({
      orderId: objectId,
      code: z.string().regex(/^\d{6}$/),
      cashPaise: z.coerce.number().int().min(0),
    })
    .parse(input);
  const order = await Order.findOne({
    _id: data.orderId,
    assignedTo: actorId,
    orderStatus: "confirmed",
    deliveryStatus: "out-for-delivery",
  });
  if (!order)
    throw Error("This delivery is not assigned to you or has already closed.");
  if (data.cashPaise !== (order.paymentMethod === "cod" ? order.totalPaise : 0))
    throw Error("The collected amount must match the amount due.");
  const subjectHash = digest(`delivery:${data.orderId}`);
  const challenge = await OTPChallenge.findOneAndUpdate(
    {
      subjectHash,
      purpose: "delivery",
      consumedAt: null,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 5 },
    },
    { $inc: { attempts: 1 } },
    { returnDocument: "after", sort: { createdAt: -1 } },
  ).select("+codeHash");
  if (
    !challenge ||
    !equalHash(
      challenge.codeHash,
      otpDigest(subjectHash, data.code, getEnv().AUTH_SECRET),
    )
  )
    throw Error("Invalid or expired delivery code.");
  await mongoose.connection.transaction(async (session) => {
    const current = await Order.findOne({
      _id: order._id,
      assignedTo: actorId,
      orderStatus: "confirmed",
      deliveryStatus: "out-for-delivery",
    }).session(session);
    if (!current) throw Error("This delivery has already changed.");
    const claimed = await OTPChallenge.updateOne(
      { _id: challenge._id, consumedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { consumedAt: new Date() } },
      { session },
    );
    if (claimed.modifiedCount !== 1)
      throw Error("Delivery code was already used.");
    const reservations = await InventoryReservation.find({
      orderId: order._id,
      status: "active",
    }).session(session);
    if (reservations.length !== current.items.length)
      throw Error("Inventory reservation mismatch");
    for (const r of reservations) {
      const sold = await InventoryItem.updateOne(
        {
          variantId: r.variantId,
          reserved: { $gte: r.quantity },
          onHand: { $gte: r.quantity },
        },
        { $inc: { reserved: -r.quantity, onHand: -r.quantity } },
        { session },
      );
      if (sold.modifiedCount !== 1)
        throw Error("Inventory invariant violation");
      r.status = "consumed";
      await r.save({ session });
      await InventoryMovement.create(
        [
          {
            orderId: current._id,
            variantId: r.variantId,
            actorId,
            quantity: r.quantity,
            kind: "sale",
          },
        ],
        { session },
      );
    }
    if (current.paymentMethod === "cod") {
      await CODCollection.create(
        [
          {
            orderId: current._id,
            collectorId: actorId,
            expectedPaise: current.totalPaise,
            collectedPaise: data.cashPaise,
            collectedAt: new Date(),
          },
        ],
        { session },
      );
      current.codStatus = "collected";
      current.paymentStatus = "paid";
      await timeline(
        current._id,
        actorId,
        "cod",
        "uncollected",
        "collected",
        session,
      );
      await timeline(
        current._id,
        actorId,
        "payment",
        "pending",
        "paid",
        session,
      );
    }
    current.deliveryStatus = "delivered";
    await current.save({ session });
    await timeline(
      current._id,
      actorId,
      "delivery",
      "out-for-delivery",
      "delivered",
      session,
    );
    await notify(
      {
        userId: current.customerId,
        type: "delivery",
        title: "Order delivered",
        body: `${current.number} was delivered successfully.`,
        href: `/account/orders/${current._id}`,
      },
      session,
    );
  });
}
export async function reconcileCOD(actorId: string, input: unknown) {
  await actor(actorId, "cod:reconcile");
  const data = z
    .object({
      orderId: objectId,
      receivedPaise: z.coerce.number().int().min(0),
      note: z.string().max(500),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const collection = await CODCollection.findOne({
      orderId: data.orderId,
      reconciledAt: null,
    }).session(session);
    if (!collection)
      throw Error("This collection is already reconciled or unavailable.");
    const discrepancy = collection.collectedPaise - data.receivedPaise;
    if (discrepancy !== 0 && data.note.trim().length < 5)
      throw Error("Explain the cash discrepancy.");
    collection.receivedPaise = data.receivedPaise;
    collection.discrepancyPaise = discrepancy;
    collection.reconciliationNote = data.note;
    collection.reconciledBy = actorId;
    collection.reconciledAt = new Date();
    await collection.save({ session });
    if (discrepancy === 0) {
      await Order.updateOne(
        { _id: data.orderId, codStatus: "collected" },
        { $set: { codStatus: "reconciled" } },
        { session },
      );
      await timeline(
        data.orderId,
        actorId,
        "cod",
        "collected",
        "reconciled",
        session,
      );
    }
    await AuditLog.create(
      [
        {
          actorId,
          action: "cod.reconcile",
          target: data.orderId,
          details: {
            receivedPaise: data.receivedPaise,
            discrepancyPaise: discrepancy,
            note: data.note,
          },
        },
      ],
      { session },
    );
  });
}
