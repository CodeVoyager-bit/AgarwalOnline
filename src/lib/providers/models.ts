import mongoose, { Schema } from "mongoose";
import { clearsShopCache } from "../db/shop-cache";

/**
 * Another shop whose items Agarwal sells: "Provided by Sharma Stationers, Roha" under them.
 * Agarwal stays the seller (one basket, one bill, our riders), so shoppers see only the name
 * and town. Staff can add one; it shows to shoppers once an owner approves it.
 */
const providerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    town: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    slug: { type: String, required: true, unique: true },
    // pending: added by staff, waiting for an owner. Only active ones are shown to shoppers.
    status: { type: String, enum: ["pending", "active", "declined"], required: true },
    // for staff only, never shown in the shop
    phone: { type: String, match: /^\d{10}$/ },
    notes: { type: String, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decidedAt: Date,
    declineReason: String,
  },
  { timestamps: true, strict: "throw" },
);
providerSchema.index({ status: 1, name: 1 });
// the shop shelf carries active providers' names, so a change empties the shop cache
clearsShopCache(providerSchema);

export const Provider = mongoose.models.Provider || mongoose.model("Provider", providerSchema);

/** What a shopper sees about a provider. */
export type ProviderLabel = { name: string; town: string };
