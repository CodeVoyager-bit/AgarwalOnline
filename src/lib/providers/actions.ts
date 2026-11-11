"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { plainMessage } from "../form-errors";
import { log } from "../logger";
import { decideProvider, saveProvider, updateProvider } from "./service";
import { setCaConfirmation } from "./billing";
import { submitProviderBilling } from "../governance/service";

/** The Providers page: add one, edit one, or (owners) approve or decline one staff added. */
export async function providerAction(_state: MutationState, form: FormData): Promise<MutationState> {
  const operation = String(form.get("operation"));
  try {
    const user = await requirePermission("catalog:write");
    const data = Object.fromEntries(form);
    let success: string;
    if (operation === "create") {
      const result = await saveProvider(user.id, data);
      success = !result.created
        ? "That provider is already on the list."
        : result.status === "active"
          ? "Provider added. Shoppers see it under its items."
          : "Provider added. Shoppers see it once an owner approves it.";
    } else if (operation === "update") {
      await updateProvider(user.id, data);
      success = "Provider saved.";
    } else if (operation === "billing") {
      const { live } = await submitProviderBilling(user.id, data);
      success = live
        ? "Saved. New orders are billed with these details."
        : "Sent to an owner for approval. Bills don't change until it's approved.";
    } else if (operation === "ca") {
      await requirePermission("settings:write");
      const confirmed = data.confirmed === "on" || data.confirmed === "true";
      await setCaConfirmation(user.id, confirmed);
      success = confirmed
        ? "Recorded: your CA has confirmed the e-commerce (TCS) registration."
        : "Taken back. Every provider's items are billed by Agarwal again for new orders.";
    } else if (operation === "decide") {
      await requirePermission("approval:review");
      await decideProvider(user.id, data);
      success =
        data.decision === "approve"
          ? "Approved. Shoppers now see the provider under its items."
          : "Declined. Whoever added it has been told why.";
    } else throw Error("Invalid operation");
    revalidatePath("/admin/providers");
    revalidatePath("/super-admin/approvals");
    revalidatePath("/admin/orders", "layout");
    revalidatePath("/", "layout");
    return { success };
  } catch (error) {
    if (error instanceof ZodError) return { error: plainMessage(error) };
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN")
      return {
        error:
          operation === "ca"
            ? "Only an owner can record the CA's confirmation."
            : operation === "billing"
              ? "Your account can't change a provider's tax details."
              : "Only an owner can approve or decline providers.",
      };
    if (/^(Only an owner|There is already|This provider|A reason|Provider not found|That provider|The provider|Finish the checklist|A change to this provider|A provider registered)/.test(message))
      return { error: message };
    log("error", "provider.unexpected-error", { error });
    return { error: "Unable to save the provider. Check the details and try again." };
  }
}
