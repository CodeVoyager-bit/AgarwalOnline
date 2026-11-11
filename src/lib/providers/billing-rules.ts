import { z } from "zod";
import { BILL_PREFIX_RE } from "../commerce/bill-split";
import { GST_STATES, gstinField, optionalField, stateOfGstin, validGstin } from "../tax/gst";

/*
 * A provider's tax and billing details, and the checklist that has to be complete before its items are
 * billed in its own name. No database here: the Providers page shows the same checklist the server checks.
 */

export const REGISTRATIONS = [
  { value: "regular", label: "Regular: its bills are tax invoices" },
  { value: "composition", label: "Composition: bills of supply, no GST charged" },
  { value: "unregistered", label: "Not registered: Agarwal bills its items" },
] as const;
/** Customize → Bills' styles, plus Agarwal's own. */
export const PROVIDER_BILL_STYLES = [
  { value: "same", label: "Same as Agarwal's bills" },
  { value: "modern", label: "Modern" },
  { value: "ledger", label: "Parchment ledger" },
  { value: "bilingual", label: "Marathi and English" },
  { value: "shree", label: "Shree festive" },
] as const;

const tick = z.preprocess((value) => value === true || value === "on" || value === "true", z.boolean());

export const billingInput = z
  .object({
    ownBills: tick,
    legalName: optionalField(
      z.string().trim().min(2, "Give the provider's legal name as it goes on its bills.").max(120, "Keep the legal name under 120 characters."),
    ),
    registration: z.enum(["regular", "composition", "unregistered"], { message: "Choose how the provider is registered for GST." }),
    gstin: optionalField(gstinField),
    address: optionalField(
      z.string().trim().min(5, "Give the provider's address as it goes on its bills.").max(300, "Keep the address under 300 characters."),
    ),
    prefix: optionalField(
      z.string().trim().toUpperCase().regex(BILL_PREFIX_RE, "The bill number prefix is 1 to 3 capital letters, like KT."),
    ),
    style: z.enum(PROVIDER_BILL_STYLES.map((option) => option.value) as [string, ...string[]]).default("same"),
    agreement: tick,
  })
  .superRefine((value, ctx) => {
    if (value.registration !== "unregistered" && !value.gstin)
      ctx.addIssue({ code: "custom", path: ["gstin"], message: "A provider registered under GST needs its GSTIN." });
  });
export type BillingInput = z.infer<typeof billingInput>;

export type ChecklistItem = { key: string; label: string; done: boolean };

/**
 * What must be true before a provider's items are billed in its own name. The CA's confirmation is about
 * Agarwal (an e-commerce operator collecting for other sellers usually collects TCS), so the owner gives it
 * once for the shop. Bills from another state would need IGST, which these bills don't work out yet.
 */
export function billingChecklist(
  billing: { registration?: string | null; gstin?: string | null; legalName?: string | null; address?: string | null; prefix?: string | null; agreement?: boolean },
  shop: { stateCode: string; caConfirmed: boolean; providerLive: boolean },
): ChecklistItem[] {
  const state = GST_STATES.find((entry) => entry.code === shop.stateCode)?.name ?? shop.stateCode;
  const gstin = billing.gstin ?? "";
  return [
    { key: "live", label: "The provider is approved", done: shop.providerLive },
    {
      key: "registered",
      label: "Registered under GST, as Regular or Composition. A provider that isn't registered stays billed by Agarwal",
      done: billing.registration === "regular" || billing.registration === "composition",
    },
    {
      key: "gstin",
      label: `A valid GSTIN from ${state}, the shop's own state (a provider in another state would need IGST, which isn't supported yet)`,
      done: validGstin(gstin) && stateOfGstin(gstin) === shop.stateCode,
    },
    {
      key: "details",
      label: "Legal name, address and bill number prefix filled in",
      done: Boolean(billing.legalName && billing.address && billing.prefix),
    },
    { key: "agreement", label: "The provider has agreed in writing that we issue bills in its name", done: Boolean(billing.agreement) },
    {
      key: "ca",
      label: "Our CA has confirmed Agarwal's e-commerce (TCS) registration (the owner ticks this once, for the shop)",
      done: shop.caConfirmed,
    },
  ];
}
