import mongoose from "mongoose";
import { z } from "zod";
import { connectDB } from "../db/connect";
import { AuditLog, User } from "../db/models";
import { objectId } from "../commerce/service";
import { assertPermission, hasPermission, type Permission, type Role } from "../auth/permissions";
import { notify } from "../engagement/service";
import { log } from "../logger";
import { optionalField } from "../tax/gst";
import { Provider } from "./models";

/** Names match without regard to capitals: "sharma stationers, roha" is the same shop. */
const SAME_TEXT = { locale: "en", strength: 2 } as const;

export const providerFields = z.object({
  name: z.string().trim().min(2, "Give the provider's shop name.").max(60, "Keep the provider's name under 60 characters."),
  town: z.string().trim().min(2, "Give the provider's town.").max(40, "Keep the town under 40 characters."),
  phone: optionalField(z.string().trim().regex(/^\d{10}$/, "Enter the provider's 10-digit phone number.")),
  notes: optionalField(z.string().trim().max(500, "Keep the notes under 500 characters.")),
});
export type ProviderFields = z.infer<typeof providerFields>;

async function authorize(actorId: string, permission: Permission, session?: mongoose.ClientSession) {
  await connectDB();
  const actor = await User.findOne({ _id: objectId.parse(actorId), active: true }).session(session ?? null);
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], permission);
  return actor;
}

/** "sharma-stationers-roha", or a numbered one when taken; names in Marathi get "provider". */
async function freeSlug(name: string, town: string, session?: mongoose.ClientSession) {
  const base =
    `${name} ${town}`
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "provider";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await Provider.exists({ slug }).session(session ?? null))) return slug;
  }
}

/** Tells the owners that a provider added by staff is waiting for them. */
async function tellOwners(provider: { name: string; town: string }, addedBy: string, session?: mongoose.ClientSession) {
  const owners = await User.find({ roles: "super-admin", active: true }).select("_id").session(session ?? null);
  for (const owner of owners)
    await notify(
      {
        userId: owner._id,
        type: "system",
        title: `New provider to approve: ${provider.name}, ${provider.town}`,
        body: `Added by ${addedBy}. Shoppers see the name under its items once you approve it.`,
        href: "/admin/providers?status=pending",
      },
      session,
    );
}

/**
 * Finds or adds a provider, by name and town. An owner's is live at once; one added by staff
 * waits for an owner, who is told. Adding a shop that is already there finds it instead of making
 * a second one, and a declined one asked for again goes back to the owner. Runs inside the
 * caller's transaction when one is given (a provider added while listing a product).
 */
export async function saveProvider(actorId: string, input: unknown, session?: mongoose.ClientSession) {
  const actor = await authorize(actorId, "catalog:write", session);
  const data = providerFields.parse(input);
  const owner = hasPermission(actor.roles as Role[], "approval:review");
  const status = owner ? "active" : "pending";
  const decided = owner ? { decidedBy: actor._id, decidedAt: new Date() } : {};
  const existing = await Provider.findOne({ name: data.name, town: data.town })
    .collation(SAME_TEXT)
    .session(session ?? null);
  if (existing && existing.status !== "declined") return { id: String(existing._id), status: existing.status as string, created: false };
  let provider;
  if (existing) {
    existing.set({ status, ...decided, declineReason: undefined, ...(owner ? {} : { decidedBy: undefined, decidedAt: undefined }) });
    provider = await existing.save({ session });
  } else {
    [provider] = await Provider.create(
      [{ ...data, slug: await freeSlug(data.name, data.town, session), status, createdBy: actor._id, ...decided }],
      { session },
    );
  }
  await AuditLog.create(
    [{ actorId, action: existing ? "provider.reopen" : "provider.create", target: String(provider._id), details: { after: provider.toObject() } }],
    { session },
  );
  if (!owner) await tellOwners(provider, actor.name, session);
  // a declined shop asked for again is a fresh request, like a new one
  return { id: String(provider._id), status, created: true };
}

/** Name, town, phone or notes. Staff can't rename a provider shoppers already see: an owner approved that name. */
export async function updateProvider(actorId: string, input: unknown) {
  const actor = await authorize(actorId, "catalog:write");
  const data = providerFields.extend({ providerId: objectId }).parse(input);
  await mongoose.connection.transaction(async (session) => {
    const provider = await Provider.findById(data.providerId).session(session);
    if (!provider) throw Error("Provider not found.");
    const renamed =
      provider.name.localeCompare(data.name, "en", { sensitivity: "accent" }) !== 0 ||
      provider.town.localeCompare(data.town, "en", { sensitivity: "accent" }) !== 0;
    if (renamed && provider.status === "active" && !hasPermission(actor.roles as Role[], "approval:review"))
      throw Error("Only an owner can rename a provider that shoppers already see.");
    if (renamed) {
      const clash = await Provider.findOne({ _id: { $ne: provider._id }, name: data.name, town: data.town })
        .collation(SAME_TEXT)
        .session(session);
      if (clash) throw Error(`There is already a provider called ${clash.name}, ${clash.town}.`);
    }
    const before = provider.toObject();
    provider.set({ name: data.name, town: data.town, phone: data.phone, notes: data.notes });
    await provider.save({ session });
    await AuditLog.create(
      [{ actorId, action: "provider.update", target: data.providerId, details: { before, after: provider.toObject() } }],
      { session },
    );
  });
}

/** An owner's decision on a provider staff added. Declining says why, and whoever added it is told. */
export async function decideProvider(actorId: string, input: unknown) {
  const actor = await authorize(actorId, "approval:review");
  const data = z
    .object({
      providerId: objectId,
      decision: z.enum(["approve", "decline"]),
      reason: z.string().trim().max(300).default(""),
    })
    .parse(input);
  if (data.decision === "decline" && data.reason.length < 5) throw Error("A reason for declining is required.");
  let decided: { name: string; town: string; createdBy: unknown } | null = null;
  await mongoose.connection.transaction(async (session) => {
    const provider = await Provider.findOne({ _id: data.providerId, status: "pending" }).session(session);
    if (!provider) throw Error("This provider has already been decided.");
    provider.set({
      status: data.decision === "approve" ? "active" : "declined",
      decidedBy: actor._id,
      decidedAt: new Date(),
      ...(data.decision === "decline" ? { declineReason: data.reason } : {}),
    });
    await provider.save({ session });
    await AuditLog.create(
      [
        {
          actorId,
          action: data.decision === "approve" ? "provider.approve" : "provider.decline",
          target: data.providerId,
          details: { name: provider.name, town: provider.town, reason: data.reason || undefined },
        },
      ],
      { session },
    );
    decided = { name: provider.name, town: provider.town, createdBy: provider.createdBy };
  });
  const result = decided as { name: string; town: string; createdBy: unknown } | null;
  if (result && String(result.createdBy) !== actorId)
    await notify({
      userId: result.createdBy,
      type: "system",
      title:
        data.decision === "approve"
          ? `${result.name}, ${result.town} is approved`
          : `${result.name}, ${result.town} was not approved`,
      body: data.decision === "approve" ? "Shoppers now see the provider under its items." : `Reason: ${data.reason}`,
      href: "/admin/providers",
    }).catch((error) => log("warn", "provider.notify-failed", { error }));
}

/** For a product: a chosen provider must exist and not be declined. Returns its status. */
export async function assertUsableProvider(providerId: unknown, session?: mongoose.ClientSession) {
  const provider = await Provider.findById(providerId).select("name status").session(session ?? null);
  if (!provider) throw Error("That provider no longer exists. Pick another one.");
  if (provider.status === "declined")
    throw Error(`The provider ${provider.name} was declined. Pick another one, or add it again.`);
  return provider.status as "pending" | "active";
}

/**
 * The "Provided by" choice on a product form: "" is the shop's own stock, "new" adds the shop
 * typed beside it (pending when staff add it), anything else is a provider's id. Returns the id
 * to keep on the product, or undefined for the shop's own.
 */
export async function chosenProvider(
  actorId: string,
  form: { providerId?: unknown; newProviderName?: unknown; newProviderTown?: unknown },
  session: mongoose.ClientSession,
) {
  const choice = String(form.providerId ?? "").trim();
  if (!choice) return undefined;
  if (choice === "new")
    return (await saveProvider(actorId, { name: form.newProviderName, town: form.newProviderTown }, session)).id;
  const id = objectId.parse(choice);
  await assertUsableProvider(id, session);
  return id;
}
