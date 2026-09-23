"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { createStaff, updateStaff } from "./service";

export async function staffAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const actor = await requirePermission("staff:manage");
    const operation = String(form.get("operation"));
    const input = {
      ...Object.fromEntries(form),
      active: form.get("active") === "on",
    };
    if (operation === "create") await createStaff(actor.id, input);
    else if (operation === "update") await updateStaff(actor.id, input);
    else throw Error("Invalid operation.");
    revalidatePath("/super-admin/staff");
    revalidatePath("/super-admin/audit");
    revalidatePath("/super-admin");
    return {
      success:
        operation === "create"
          ? "Staff account created."
          : "Staff account updated.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0].message };
    const message = error instanceof Error ? error.message : "";
    if (/^(Manage your|Keep at least|Staff account)/.test(message))
      return { error: message };
    if (/duplicate key/i.test(message))
      return { error: "That email or phone number is already in use." };
    return { error: "Unable to save this staff account." };
  }
}
