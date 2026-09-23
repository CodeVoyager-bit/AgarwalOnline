import mongoose, { Schema } from "mongoose";
const conversation = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    title: { type: String, required: true },
    assignedAdminId: { type: Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: [
        "open",
        "assigned",
        "waiting-customer",
        "waiting-support",
        "resolved",
        "closed",
      ],
      default: "open",
    },
    sequence: { type: Number, default: 0 },
  },
  { timestamps: true, strict: "throw" },
);
conversation.index({ customerId: 1, updatedAt: -1 });
conversation.index({ assignedAdminId: 1, status: 1 });
const message = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "ChatConversation",
      required: true,
    },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderName: String,
    sequence: { type: Number, required: true },
    clientMessageId: { type: String, required: true },
    body: { type: String, required: true },
    internal: { type: Boolean, default: false },
  },
  { timestamps: true, strict: "throw" },
);
message.index({ conversationId: 1, sequence: 1 }, { unique: true });
message.index({ senderId: 1, clientMessageId: 1 }, { unique: true });
const receipt = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "ChatConversation",
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deliveredSequence: { type: Number, default: 0 },
    readSequence: { type: Number, default: 0 },
    typingUntil: Date,
  },
  { timestamps: true, strict: "throw" },
);
receipt.index({ conversationId: 1, userId: 1 }, { unique: true });
export const ChatConversation =
  mongoose.models.ChatConversation ||
  mongoose.model("ChatConversation", conversation);
export const ChatMessage =
  mongoose.models.ChatMessage || mongoose.model("ChatMessage", message);
export const ChatReceipt =
  mongoose.models.ChatReceipt || mongoose.model("ChatReceipt", receipt);
