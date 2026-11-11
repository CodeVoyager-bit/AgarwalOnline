import mongoose from "mongoose";
import { connectDB } from "../db/connect";
import { AuditLog, User } from "../db/models";
import { SystemSetting } from "../commerce/models";
import { objectId } from "../commerce/service";
import { assertPermission, type Role } from "../auth/permissions";
import { stateOfGstin } from "../tax/gst";
import { taxProfile } from "../tax/profile";
import { billingChecklist, type BillingInput } from "./billing-rules";
import { Provider } from "./models";

/*
 * Saving a provider's tax and billing details (the approval for an admin's change goes through
 * src/lib/governance/service.ts, which calls applyProviderBilling once an owner approves), and the
 * owner's once-for-the-shop word that the CA confirmed Agarwal's e-commerce (TCS) registration.
 */

const CA_KEY = "provider-billing";

/** When the owner said the CA confirmed Agarwal's e-commerce (TCS) registration, or null. */
export async function caConfirmation(session?: mongoose.ClientSession) {
  await connectDB();
  const setting = await SystemSetting.findOne({ key: CA_KEY }).session(session ?? null);
  const value = setting?.value as { confirmedAt?: string | Date; confirmedBy?: string } | undefined;
  return value?.confirmedAt ? { confirmedAt: new Date(value.confirmedAt), confirmedBy: value.confirmedBy } : null;
}

/**
 * The owner ticks (or unticks) the CA's confirmation. Taking it back switches every provider back to
 * Agarwal's bills for new orders, since none of them may then bill in its own name.
 */
export async function setCaConfirmation(actorId: string, confirmed: boolean) {
  await connectDB();
  const actor = await User.findOne({ _id: objectId.parse(actorId), active: true });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], "settings:write");
  await mongoose.connection.transaction(async (session) => {
    const before = (await SystemSetting.findOne({ key: CA_KEY }).session(session))?.value ?? null;
    const after = confirmed ? { confirmedAt: new Date(), confirmedBy: actorId } : {};
    await SystemSetting.updateOne({ key: CA_KEY }, { $set: { value: after }, $inc: { version: 1 } }, { upsert: true, session });
    const switchedOff = confirmed
      ? []
      : await Provider.find({ "billing.ownBills": true }).select("name").session(session);
    if (switchedOff.length)
      await Provider.updateMany({ "billing.ownBills": true }, { $set: { "billing.ownBills": false } }, { session });
    await AuditLog.create(
      [
        {
          actorId,
          action: confirmed ? "provider.ca-confirmed" : "provider.ca-withdrawn",
          target: CA_KEY,
          details: { before, after, switchedOff: switchedOff.map((provider) => provider.name) },
        },
      ],
      { session },
    );
  });
}

/** A provider's billing as the form and the approval's "before" read it. */
export function billingValues(provider: { billing?: Record<string, unknown> | null }) {
  const billing = (provider.billing ?? {}) as Record<string, unknown>;
  return {
    ownBills: Boolean(billing.ownBills),
    legalName: (billing.legalName as string) || undefined,
    registration: (billing.registration as string) || "unregistered",
    gstin: (billing.gstin as string) || undefined,
    address: (billing.address as string) || undefined,
    prefix: (billing.prefix as string) || undefined,
    style: (billing.style as string) || "same",
    agreement: Boolean(billing.agreementAt),
  };
}

/** Throws, naming what's missing, when the details would switch on own bills before the checklist is done. */
export async function checkBilling(providerId: unknown, data: BillingInput, session?: mongoose.ClientSession) {
  if (!data.ownBills) return;
  const [provider, shop, ca] = await Promise.all([
    Provider.findById(providerId).select("status").session(session ?? null),
    taxProfile(),
    caConfirmation(session),
  ]);
  if (!provider) throw Error("Provider not found.");
  const missing = billingChecklist(data, {
    stateCode: shop.stateCode,
    caConfirmed: Boolean(ca),
    providerLive: provider.status === "active",
  }).filter((item) => !item.done);
  if (missing.length)
    throw Error(`Finish the checklist before its items are billed in its own name: ${missing.map((item) => item.label).join("; ")}.`);
}

/**
 * Applies a provider's tax and billing details: straight away for an owner, or when an owner approves an
 * admin's request. `requesterId` is who asked, recorded as the one who took the provider's agreement.
 */
export async function applyProviderBilling(
  providerId: unknown,
  data: BillingInput,
  requesterId: string,
  actorId: string,
  session: mongoose.ClientSession,
) {
  await checkBilling(providerId, data, session);
  const provider = await Provider.findById(providerId).session(session);
  if (!provider) throw Error("Provider not found.");
  const before = provider.toObject().billing ?? null;
  const agreedBefore = Boolean(provider.billing?.agreementAt);
  provider.set("billing", {
    ownBills: data.ownBills,
    legalName: data.legalName,
    registration: data.registration,
    gstin: data.registration === "unregistered" ? undefined : data.gstin,
    address: data.address,
    stateCode: stateOfGstin(data.gstin),
    prefix: data.prefix,
    style: data.style,
    ...(data.agreement
      ? agreedBefore
        ? { agreementAt: provider.billing?.agreementAt, agreementBy: provider.billing?.agreementBy }
        : { agreementAt: new Date(), agreementBy: requesterId }
      : {}),
  });
  await provider.save({ session });
  await AuditLog.create(
    [{ actorId, action: "provider.billing", target: String(provider._id), details: { before, after: provider.toObject().billing } }],
    { session },
  );
}
