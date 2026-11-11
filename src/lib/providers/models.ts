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
    /**
     * Tax and billing (Providers → Tax and billing): with ownBills on, its items get a bill in its own name and
     * GSTIN instead of Agarwal's. An owner's edits apply at once; an admin's wait in Approvals. Switching it on
     * needs the checklist in billing.ts: a GST registration, the provider's written agreement and the owner's
     * word that the CA confirmed Agarwal's e-commerce (TCS) registration.
     */
    billing: {
      ownBills: { type: Boolean, default: false },
      legalName: String,
      registration: { type: String, enum: ["regular", "composition", "unregistered"] },
      gstin: String,
      address: String,
      stateCode: String,
      // "KT" gives bills KT/26-27/0001
      prefix: String,
      // a style from Customize → Bills, or "same" for Agarwal's
      style: String,
      // when the owner or an admin recorded the provider's written agreement to bills in its name
      agreementAt: Date,
      agreementBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
  },
  { timestamps: true, strict: "throw" },
);
providerSchema.index({ status: 1, name: 1 });
// the shop shelf carries active providers' names, so a change empties the shop cache
clearsShopCache(providerSchema);

export const Provider = mongoose.models.Provider || mongoose.model("Provider", providerSchema);

/** What a shopper sees about a provider. */
export type ProviderLabel = { name: string; town: string };
