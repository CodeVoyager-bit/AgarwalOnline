import { returnTransitions } from "./transitions";
import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { User, AuditLog } from "../db/models";
import { Order } from "../commerce/models";
import { objectId } from "../commerce/service";
import { assertPermission, type Permission, type Role } from "../auth/permissions";
import { Complaint, ReturnRequest } from "./models";
import { rateLimit } from "../auth/rate-limit";
import { notify } from "../engagement/service";
async function authorize(id: string, permission: Permission) {
  await connectDB();
  const user = await User.findOne({ _id: objectId.parse(id), active: true });
  if (!user) throw Error("UNAUTHENTICATED");
  assertPermission(user.roles as Role[], permission);
}
export async function createComplaint(actorId: string, input: unknown) {
  await authorize(actorId, "complaint:own");
  const data = z
    .object({
      orderId: objectId,
      type: z.enum(["missing-item", "damaged-item", "wrong-item", "other"]),
      description: z.string().trim().min(10).max(2000),
      requestReturn: z.boolean().default(false),
    })
    .parse(input);
  await rateLimit(`complaint:${actorId}`, 10);
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({
      _id: data.orderId,
      customerId: actorId,
    }).session(session);
    if (!order) throw Error("FORBIDDEN");
    if (
      (data.type !== "other" || data.requestReturn) &&
      order.deliveryStatus !== "delivered"
    )
      throw Error("Item complaints and returns are available after delivery.");
    const [c] = await Complaint.create(
      [
        {
          customerId: actorId,
          orderId: order._id,
          type: data.type,
          description: data.description,
        },
      ],
      { session },
    );
    if (data.requestReturn)
      await ReturnRequest.create(
        [{ customerId: actorId, orderId: order._id, complaintId: c._id }],
        { session },
      );
    await AuditLog.create(
      [
        {
          actorId,
          action: "complaint.create",
          target: String(c._id),
          details: { type: data.type, returnRequested: data.requestReturn },
        },
      ],
      { session },
    );
    await notify(
      {
        userId: c.customerId,
        type: "system",
        title: "We received your complaint",
        body: `The store team will review your ${data.type.replaceAll("-", " ")} report.`,
        href: "/account/complaints",
      },
      session,
    );
  });
}
export async function resolveComplaint(actorId: string, input: unknown) {
  await authorize(actorId, "complaint:manage");
  const data = z
    .object({
      complaintId: objectId,
      status: z.enum(["reviewing", "resolved", "rejected"]),
      resolution: z.string().trim().min(5).max(2000),
    })
    .parse(input);
  await mongoose.connection.transaction(async (session) => {
    const c = await Complaint.findOne({
      _id: data.complaintId,
      status: { $in: ["open", "reviewing"] },
    }).session(session);
    if (!c) throw Error("This complaint is already closed.");
    const before = c.status;
    c.status = data.status;
    c.resolution = data.resolution;
    c.resolvedBy = actorId;
    await c.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: "complaint.update",
          target: data.complaintId,
          details: { before, after: data.status, resolution: data.resolution },
        },
      ],
      { session },
    );
    await notify(
      {
        userId: c.customerId,
        type: "system",
        title: "Complaint updated",
        body: `Your complaint is now ${data.status}. ${data.resolution}`,
        href: "/account/complaints",
      },
      session,
    );
  });
}
export async function updateReturn(actorId: string, input: unknown) {
  await authorize(actorId, "complaint:manage");
  const data = z
    .object({
      returnId: objectId,
      status: z.enum([
        "approved",
        "rejected",
        "pickup-scheduled",
        "picked-up",
        "received",
        "closed",
      ]),
      pickupDate: z.union([z.iso.date(), z.literal("")]).optional(),
      notes: z.string().trim().min(5).max(1000),
    })
    .parse(input);
  if (data.status === "pickup-scheduled" && !data.pickupDate)
    throw Error("Choose the pickup date.");
  await mongoose.connection.transaction(async (session) => {
    const r = await ReturnRequest.findById(data.returnId).session(session);
    if (!r || !returnTransitions[r.status]?.includes(data.status))
      throw Error("This return status change is not allowed.");
    const before = r.status;
    r.status = data.status;
    r.notes = data.notes;
    if (data.pickupDate) r.pickupDate = data.pickupDate;
    await r.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: "return.update",
          target: data.returnId,
          details: {
            before,
            after: data.status,
            pickupDate: data.pickupDate,
            notes: data.notes,
          },
        },
      ],
      { session },
    );
    await notify(
      {
        userId: r.customerId,
        type: "system",
        title: "Return updated",
        body: `Your return is now ${data.status}. ${data.notes}`,
        href: "/account/complaints",
      },
      session,
    );
  });
}
