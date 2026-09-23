"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "../auth/session";
import type { MutationState } from "../commerce/actions";
import { storeEvidence } from "./service";

export async function evidenceAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await currentUser();
    if (!user) throw Error("UNAUTHENTICATED");
    await storeEvidence(user.id, {
      file: form.get("file") as File,
      purpose: form.get("purpose"),
      orderId: form.get("orderId"),
      complaintId: form.get("complaintId"),
      productId: form.get("productId"),
    });
    for (const path of [
      "/account/complaints",
      "/admin/complaints",
      "/admin/products",
      "/delivery",
    ])
      revalidatePath(path);
    return { success: "Photograph uploaded securely." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      error: /^(Choose|Photographs|Use a|Image storage|Product)/.test(message)
        ? message
        : "Unable to upload this photograph.",
    };
  }
}
