"use client";

import { useActionState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { cartAction } from "@/lib/commerce/actions";

export function CartLineControls({
  variantId,
  quantity,
  max,
  name,
}: {
  variantId: string;
  quantity: number;
  max: number;
  name: string;
}) {
  const [state, action, pending] = useActionState(cartAction, {});
  return (
    <form
      action={action}
      className="qty-stepper"
      data-pending={pending}
      aria-label={`Quantity for ${name}`}
    >
      <input type="hidden" name="variantId" value={variantId} />
      <button
        name="quantity"
        value={quantity - 1}
        disabled={pending}
        aria-label={quantity === 1 ? `Remove ${name}` : "Decrease quantity"}
      >
        <Minus size={16} />
      </button>
      <output aria-live="polite">{quantity}</output>
      <button
        name="quantity"
        value={quantity + 1}
        disabled={pending || quantity >= max}
        aria-label="Increase quantity"
      >
        <Plus size={16} />
      </button>
      <button name="quantity" value={0} className="qty-remove" disabled={pending}>
        <Trash2 size={14} aria-hidden="true" /> Remove
      </button>
      {state.error && (
        <span role="alert" className="quick-error">
          {state.error}
        </span>
      )}
    </form>
  );
}
