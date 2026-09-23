"use client";
import { useActionState } from "react";
import { Minus, Plus } from "lucide-react";
import { cartAction, quickAddAction } from "@/lib/commerce/actions";

type State = { qty: number; error?: string };

/** Quick-commerce style ADD that turns into an in-place stepper once the item is in the basket. */
export function QuickAdd({
  variantId,
  available,
  max,
  name,
}: {
  variantId: string;
  available: number;
  max: number;
  name: string;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    async (prev, form) => {
      const next = Number(form.get("next"));
      const payload = new FormData();
      payload.set("variantId", variantId);
      payload.set("quantity", String(next));
      const result =
        next > prev.qty
          ? await quickAddAction({}, payload)
          : await cartAction({}, payload);
      return result.error ? { qty: prev.qty, error: result.error } : { qty: next };
    },
    { qty: 0 },
  );
  const limit = Math.min(max, available);
  return (
    <form action={action} className="quick-add" data-pending={pending}>
      {state.qty === 0 ? (
        <button
          className="add-button"
          name="next"
          value={1}
          disabled={pending || available === 0}
          aria-label={available ? `Add ${name} to basket` : `${name} is out of stock`}
        >
          {available ? "Add" : "Sold out"}
        </button>
      ) : (
        <span className="qty-stepper compact" aria-label={`Quantity of ${name} in basket`}>
          <button
            name="next"
            value={state.qty - 1}
            disabled={pending}
            aria-label={state.qty === 1 ? `Remove ${name} from basket` : "Decrease quantity"}
          >
            <Minus size={16} />
          </button>
          <output aria-live="polite">{state.qty}</output>
          <button
            name="next"
            value={state.qty + 1}
            disabled={pending || state.qty >= limit}
            aria-label="Increase quantity"
          >
            <Plus size={16} />
          </button>
        </span>
      )}
      {state.error && (
        <span role="alert" className="quick-error">
          {state.error}
        </span>
      )}
    </form>
  );
}
