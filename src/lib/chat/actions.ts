"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../auth/session";
import { createConversation, changeConversation } from "./service";
import type { MutationState } from "../commerce/actions";
export async function conversationAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  let id = "";
  try {
    const user = await requirePermission("chat:own");
    id = await createConversation(user.id, {
      title: form.get("title"),
      orderId: form.get("orderId") ?? "",
    });
  } catch {
    return {
      error:
        "Unable to open this conversation. Please check the subject and try again.",
    };
  }
  redirect(`/account/support/${id}`);
}
export async function conversationStatusAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("profile:own");
    const id = String(form.get("conversationId"));
    await changeConversation(user.id, {
      conversationId: id,
      status: form.get("status"),
      assignToSelf: form.get("assignToSelf") === "on",
    });
    revalidatePath(`/account/support/${id}`);
    revalidatePath(`/admin/support/${id}`);
    return { success: "Conversation updated." };
  } catch {
    return { error: "Unable to update this conversation." };
  }
}
