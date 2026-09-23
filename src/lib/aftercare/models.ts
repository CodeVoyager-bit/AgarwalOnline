import mongoose, { Schema } from "mongoose";
const complaint = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    type: {
      type: String,
      enum: ["missing-item", "damaged-item", "wrong-item", "other"],
      required: true,
    },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["open", "reviewing", "resolved", "rejected"],
      default: "open",
    },
    resolution: String,
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, strict: "throw" },
);
complaint.index({ customerId: 1, createdAt: -1 });
const returnSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    complaintId: {
      type: Schema.Types.ObjectId,
      ref: "Complaint",
      unique: true,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "requested",
        "approved",
        "pickup-scheduled",
        "picked-up",
        "received",
        "rejected",
        "closed",
      ],
      default: "requested",
    },
    pickupDate: String,
    notes: String,
  },
  { timestamps: true, strict: "throw" },
);
export const Complaint =
  mongoose.models.Complaint || mongoose.model("Complaint", complaint);
export const ReturnRequest =
  mongoose.models.ReturnRequest ||
  mongoose.model("ReturnRequest", returnSchema);
