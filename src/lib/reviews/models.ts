import mongoose, { Schema } from "mongoose";

const reviewSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    verifiedOrderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String, maxlength: 80 },
    body: { type: String, maxlength: 1000 },
    status: {
      type: String,
      enum: ["published", "hidden"],
      default: "published",
    },
    moderatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    moderationReason: String,
  },
  { timestamps: true, strict: "throw" },
);
reviewSchema.index({ customerId: 1, productId: 1 }, { unique: true });
reviewSchema.index({ productId: 1, status: 1, createdAt: -1 });

const reportSchema = new Schema(
  {
    reviewId: { type: Schema.Types.ObjectId, ref: "ProductReview", required: true },
    reportedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, maxlength: 300, required: true },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
  },
  { timestamps: true, strict: "throw" },
);
reportSchema.index({ reviewId: 1, reportedBy: 1 }, { unique: true });

export const ProductReview =
  mongoose.models.ProductReview || mongoose.model("ProductReview", reviewSchema);
export const ReviewReport =
  mongoose.models.ReviewReport || mongoose.model("ReviewReport", reportSchema);
