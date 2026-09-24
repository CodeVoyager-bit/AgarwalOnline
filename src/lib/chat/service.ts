import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { User } from "../db/models";
import { getAuth } from "../auth/better-auth";
import { hasPermission, type Role } from "../auth/permissions";
import { Order } from "../commerce/models";
import { objectId } from "../commerce/service";
import { ChatConversation, ChatMessage, ChatReceipt } from "./models";
import { rateLimit } from "../auth/rate-limit";
import { notify } from "../engagement/service";
export type ChatIdentity = { id: string; name: string; roles: Role[] };
/** Staff are customers too, so the side they act on is decided by the conversation, not the account. */
const actsAsCustomer = (user: ChatIdentity, c: { customerId: unknown }) =>
  String(c.customerId) === user.id;
export type MessageDTO = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  sequence: number;
  body: string;
  internal: boolean;
  createdAt: string;
};
export async function chatIdentity(userId: string): Promise<ChatIdentity> {
  await connectDB();
  const user = await User.findOne({
    _id: objectId.parse(userId),
    active: true,
  });
  if (
    !user ||
    (!hasPermission(user.roles as Role[], "chat:own") &&
      !hasPermission(user.roles as Role[], "chat:support"))
  )
    throw Error("FORBIDDEN");
  return { id: String(user._id), name: user.name, roles: user.roles as Role[] };
}
export async function requestIdentity(headers: Headers) {
  const authSession = await getAuth().api.getSession({ headers });
  if (!authSession) throw Error("UNAUTHENTICATED");
  return chatIdentity(authSession.user.id);
}
export function scope(user: ChatIdentity) {
  if (user.roles.includes("super-admin")) return {};
  const own = { customerId: user.id };
  return hasPermission(user.roles, "chat:support")
    ? { $or: [own, { assignedAdminId: user.id }, { assignedAdminId: null }] }
    : own;
}
export async function authorizeConversation(
  user: ChatIdentity,
  idInput: unknown,
) {
  const id = objectId.parse(idInput);
  const conversation = await ChatConversation.findOne({
    _id: id,
    ...scope(user),
  });
  if (!conversation) throw Error("FORBIDDEN");
  return conversation;
}
export async function createConversation(userId: string, input: unknown) {
  await chatIdentity(userId); // must be an active account
  const data = z
    .object({
      title: z.string().trim().min(3).max(100),
      orderId: z.union([objectId, z.literal("")]).optional(),
    })
    .parse(input);
  await rateLimit(`conversation:${userId}`, 10);
  if (
    data.orderId &&
    !(await Order.exists({ _id: data.orderId, customerId: userId }))
  )
    throw Error("FORBIDDEN");
  const conversation = await ChatConversation.create({
    customerId: userId,
    title: data.title,
    ...(data.orderId ? { orderId: data.orderId } : {}),
  });
  return String(conversation._id);
}
function dto(m: Record<string, unknown>): MessageDTO {
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    senderId: String(m.senderId),
    senderName: String(m.senderName),
    sequence: Number(m.sequence),
    body: String(m.body),
    internal: Boolean(m.internal),
    createdAt: new Date(m.createdAt as string).toISOString(),
  };
}
export async function sendMessage(
  user: ChatIdentity,
  input: unknown,
): Promise<MessageDTO> {
  const data = z
    .object({
      conversationId: objectId,
      clientMessageId: z.string().uuid(),
      body: z.string().trim().min(1).max(2000),
      internal: z.boolean().default(false),
    })
    .parse(input);
  const asCustomer = actsAsCustomer(
    user,
    await authorizeConversation(user, data.conversationId),
  );
  if (asCustomer && data.internal) throw Error("FORBIDDEN");
  await rateLimit(`chat-message:${user.id}`, 30, 60000);
  let result: MessageDTO | undefined;
  let notifyCustomer: string | undefined;
  await mongoose.connection.transaction(async (session) => {
    const existing = await ChatMessage.findOne({
      senderId: user.id,
      clientMessageId: data.clientMessageId,
    }).session(session);
    if (existing) {
      if (String(existing.conversationId) !== data.conversationId)
        throw Error("Message id conflict");
      result = dto(existing.toObject());
      return;
    }
    const c = await ChatConversation.findOneAndUpdate(
      {
        _id: data.conversationId,
        ...scope(user),
        status: { $nin: ["closed", "resolved"] },
      },
      {
        $inc: { sequence: 1 },
        ...(!data.internal
          ? {
              $set: {
                status: asCustomer ? "waiting-support" : "waiting-customer",
              },
            }
          : {}),
      },
      { returnDocument: "after", session },
    );
    if (!c)
      throw Error("This conversation is closed. Reopen it to send a message.");
    const [m] = await ChatMessage.create(
      [
        {
          ...data,
          body: data.body.replace(
            /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
            "",
          ),
          senderId: user.id,
          senderName: asCustomer ? user.name : "Store team",
          sequence: c.sequence,
        },
      ],
      { session },
    );
    result = dto(m.toObject());
    if (!asCustomer && !data.internal)
      notifyCustomer = String(c.customerId);
  });
  if (notifyCustomer)
    await notify({
      userId: notifyCustomer,
      type: "support",
      title: "New message from the store",
      body: data.body,
      href: `/account/support/${data.conversationId}`,
    });
  return result!;
}
export async function syncConversation(user: ChatIdentity, input: unknown) {
  const data = z
    .object({
      conversationId: objectId,
      after: z.number().int().min(0).default(0),
      q: z.string().max(100).default(""),
    })
    .parse(input);
  const c = await authorizeConversation(user, data.conversationId);
  const filter: Record<string, unknown> = {
    conversationId: c._id,
    sequence: { $gt: data.after },
    ...(actsAsCustomer(user, c) ? { internal: false } : {}),
  };
  if (data.q)
    filter.body = {
      $regex: data.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  const messages = await ChatMessage.find(filter)
    .sort({ sequence: 1 })
    .limit(100);
  const receipts = await ChatReceipt.find({ conversationId: c._id }).select(
    "userId deliveredSequence readSequence typingUntil",
  );
  const now = Date.now();
  return {
    messages: messages.map((m) => dto(m.toObject())),
    cursor: messages.length
      ? messages[messages.length - 1].sequence
      : c.sequence,
    hasMore: messages.length === 100,
    status: c.status,
    receipts: receipts.map((r) => ({
      userId: String(r.userId),
      delivered: r.deliveredSequence,
      read: r.readSequence,
    })),
    typing: receipts.some(
      (r) => String(r.userId) !== user.id && r.typingUntil?.getTime() > now,
    ),
  };
}
export async function setTyping(user: ChatIdentity, input: unknown) {
  const data = z
    .object({ conversationId: objectId, typing: z.boolean() })
    .parse(input);
  const c = await authorizeConversation(user, data.conversationId);
  await ChatReceipt.updateOne(
    { conversationId: c._id, userId: user.id },
    { $set: { typingUntil: data.typing ? new Date(Date.now() + 6000) : null } },
    { upsert: true },
  );
  return {};
}
export async function markReceipt(user: ChatIdentity, input: unknown) {
  const data = z
    .object({
      conversationId: objectId,
      sequence: z.number().int().min(0),
      read: z.boolean(),
    })
    .parse(input);
  const c = await authorizeConversation(user, data.conversationId);
  if (data.sequence > c.sequence) throw Error("Invalid receipt");
  await ChatReceipt.updateOne(
    { conversationId: c._id, userId: user.id },
    {
      $max: {
        deliveredSequence: data.sequence,
        ...(data.read ? { readSequence: data.sequence } : {}),
      },
    },
    { upsert: true },
  );
  return {
    userId: user.id,
    delivered: data.sequence,
    read: data.read ? data.sequence : 0,
  };
}
export async function changeConversation(userId: string, input: unknown) {
  const user = await chatIdentity(userId);
  const data = z
    .object({
      conversationId: objectId,
      status: z.enum([
        "open",
        "assigned",
        "waiting-customer",
        "waiting-support",
        "resolved",
        "closed",
      ]),
      assignToSelf: z.boolean().default(false),
    })
    .parse(input);
  const c = await authorizeConversation(user, data.conversationId);
  if (
    actsAsCustomer(user, c) &&
    (data.status !== "open" ||
      !["closed", "resolved"].includes(c.status) ||
      data.assignToSelf)
  )
    throw Error("FORBIDDEN");
  await ChatConversation.updateOne(
    { _id: c._id, ...scope(user) },
    {
      $set: {
        status: data.status,
        ...(data.assignToSelf ? { assignedAdminId: user.id } : {}),
      },
    },
  );
}
