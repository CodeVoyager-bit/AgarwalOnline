"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { currentUser, requirePermission } from "../auth/session";
import { Address } from "./models";
import { ServiceArea } from "../db/models";
import {
  setCartLine,
  objectId,
  checkout,
  cancelOrder,
  reorder,
} from "./service";
export type MutationState = {
  error?: string;
  success?: string;
  saved?: boolean;
};
function errorMessage(e: unknown) {
  if (e instanceof z.ZodError) return e.issues[0].message;
  const message = e instanceof Error ? e.message : "";
  return /^(Select|Cash|This|Your|Too many basket|A basket|Insufficient|Order exceeds|UNAUTHENTICATED|FORBIDDEN)/.test(
    message,
  )
    ? message
    : "Unable to save. Please try again.";
}
export async function cartAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await currentUser();
    if (user)
      await setCartLine(user.id, form.get("variantId"), form.get("quantity"));
    else {
      const { setGuestCartLine } = await import("./guest-cart");
      await setGuestCartLine(form.get("variantId"), form.get("quantity"));
    }
    revalidatePath("/", "layout");
    return { success: "Basket updated." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
export async function addressAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("order:own");
    const operation = z
      .enum(["create", "update", "delete"])
      .catch("create")
      .parse(form.get("operation"));
    const addressId = form.get("addressId")
      ? objectId.parse(form.get("addressId"))
      : undefined;
    if (operation === "delete") {
      if (!addressId) throw Error("This address is unavailable.");
      const deleted = await Address.deleteOne({
        _id: addressId,
        customerId: user.id,
      });
      if (!deleted.deletedCount) throw Error("This address is unavailable.");
      revalidatePath("/account/addresses");
      return { success: "Address removed." };
    }
    const data = z
      .object({
        name: z.string().trim().min(2).max(80),
        phone: z.string().regex(/^[6-9]\d{9}$/),
        line: z.string().trim().min(8).max(250),
        pin: z.string().regex(/^\d{6}$/),
        areaId: objectId,
        instructions: z.string().max(300),
        isDefault: z.boolean().optional(),
      })
      .parse({ ...Object.fromEntries(form), isDefault: form.get("isDefault") === "on" });
    const area = await ServiceArea.findOne({
      _id: data.areaId,
      enabled: true,
      pincodes: data.pin,
    });
    if (!area)
      throw Error("This PIN code is not enabled for the selected area.");
    if (operation === "update") {
      if (!addressId) throw Error("This address is unavailable.");
      const updated = await Address.updateOne(
        { _id: addressId, customerId: user.id },
        { $set: data },
        { runValidators: true },
      );
      if (!updated.matchedCount) throw Error("This address is unavailable.");
      if (data.isDefault)
        await Address.updateMany(
          { customerId: user.id, _id: { $ne: addressId } },
          { $set: { isDefault: false } },
        );
    } else {
      if (data.isDefault)
        await Address.updateMany(
          { customerId: user.id },
          { $set: { isDefault: false } },
        );
      await Address.create({ ...data, customerId: user.id });
    }
    revalidatePath("/account/addresses");
    return {
      success: operation === "update" ? "Address updated." : "Address saved.",
    };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function reorderAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("order:own");
    const result = await reorder(user.id, form.get("orderId"));
    revalidatePath("/", "layout");
    return {
      success: `${result.added} item${result.added === 1 ? "" : "s"} added to your basket${result.skipped ? ` · ${result.skipped} unavailable` : ""}.`,
    };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
export async function checkoutAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  let id = "";
  try {
    const user = await requirePermission("order:own");
    id = await checkout(user.id, {
      addressId: form.get("addressId"),
      slotId: form.get("slotId"),
      idempotencyKey: form.get("idempotencyKey"),
      method: form.get("method"),
      promotionCode: (await cookies()).get("ags_promotion")?.value,
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  redirect(`/account/orders/${id}`);
}
export async function cancelAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const user = await requirePermission("order:own");
    await cancelOrder(user.id, form.get("orderId"));
    revalidatePath(`/account/orders/${form.get("orderId")}`);
    return { success: "Order cancelled. Reserved stock has been released." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
export async function quickAddAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const user = await currentUser();
  try {
    if (!user) {
      const { guestCartLines, setGuestCartLine } = await import("./guest-cart");
      const variantId = objectId.parse(form.get("variantId"));
      const current = (await guestCartLines()).find(
        (line) => line.variantId === variantId,
      );
      await setGuestCartLine(variantId, (current?.quantity ?? 0) + 1);
      revalidatePath("/", "layout");
      return { success: "Added" };
    }
    const variantId = objectId.parse(form.get("variantId"));
    const { CartLine } = await import("./models");
    const mongoose = (await import("mongoose")).default;
    await mongoose.connection.transaction(async (session) => {
      const line = await CartLine.findOne({
        customerId: user.id,
        variantId,
      }).session(session);
      const { ProductVariant, Product } = await import("../db/models");
      const variant = await ProductVariant.findById(variantId).session(session);
      if (
        !variant ||
        !(await Product.exists({
          _id: variant.productId,
          status: "published",
        }).session(session))
      )
        throw Error("This product is unavailable.");
      const quantity = (line?.quantity ?? 0) + 1;
      if (quantity > variant.maxQuantity)
        throw Error("This item has reached its purchase limit.");
      await CartLine.updateOne(
        { customerId: user.id, variantId },
        { $set: { quantity } },
        { upsert: true, session, runValidators: true },
      );
    });
    revalidatePath("/", "layout");
    return { success: "Added" };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
