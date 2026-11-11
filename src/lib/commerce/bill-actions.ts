"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "../auth/session";
import type { MutationState } from "./actions";
import { setBillTo, setShopNameOnBills } from "./bill";
import { plainMessage } from "../form-errors";
import { log } from "../logger";
import { connectDB } from "../db/connect";
import { Order } from "./models";
import { objectId } from "./service";
import { billLink } from "../documents/bill-request";

/** The Bill card on a staff order page: who the bill is made out to, and (owners) the shop's name on bills. */
export async function billAction(_state: MutationState, form: FormData): Promise<MutationState> {
  try {
    const user = await requirePermission("order:manage");
    const orderId = String(form.get("orderId") ?? "");
    if (form.get("operation") === "shop-name") {
      await requirePermission("settings:write");
      await setShopNameOnBills(user.id, { legalName: form.get("legalName") });
      revalidatePath(`/admin/orders/${orderId}`);
      revalidatePath("/super-admin");
      return { success: "Shop name saved. Every bill from now on carries it; bills already given keep theirs." };
    }
    const { reissued, number } = await setBillTo(user.id, {
      orderId,
      name: form.get("name") ?? "",
      gstin: form.get("gstin") ?? "",
    });
    revalidatePath(`/admin/orders/${orderId}`);
    return {
      success: reissued
        ? `Saved. The bill was already given, so it is re-issued as bill ${number}, which says which bill it replaces.`
        : "Bill details saved.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: plainMessage(error) };
    const message = error instanceof Error ? error.message : "";
    if (/^(Order not found|A cancelled order)/.test(message)) return { error: message };
    if (message === "FORBIDDEN") return { error: "Only an owner can change the shop's name on bills." };
    log("error", "bill.unexpected-error", { error });
    return { error: "Unable to save the bill details." };
  }
}

/**
 * A new view-only bill link for an order (/b/<code>), for one sent to the wrong person: the old link stops
 * opening the bills at once. Share the bill again to send the new one.
 */
export async function billLinkAction(_state: MutationState, form: FormData): Promise<MutationState> {
  try {
    const user = await requirePermission("order:manage");
    const orderId = String(form.get("orderId") ?? "");
    if (!objectId.safeParse(orderId).success) return { error: "Order not found." };
    await connectDB();
    const order = await Order.findById(orderId);
    if (!order) return { error: "Order not found." };
    if (order.orderStatus === "cancelled") return { error: "A cancelled order has no bill to share." };
    await billLink(order, true, user.id);
    revalidatePath(`/admin/orders/${orderId}`);
    return { success: "New link made. The old one no longer opens the bills; share a bill again to send the new link." };
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return { error: "Only staff who manage orders can do that." };
    log("error", "bill-link.reset-failed", { error });
    return { error: "Couldn't make a new link. Try again." };
  }
}
