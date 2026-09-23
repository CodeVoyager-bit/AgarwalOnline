"use client";

import { useActionState } from "react";
import { Heart } from "lucide-react";
import { wishlistAction } from "@/lib/engagement/actions";

export function WishlistButton({
  productId,
  saved = false,
}: {
  productId: string;
  saved?: boolean;
}) {
  const [state, action, pending] = useActionState(wishlistAction, { saved });
  return (
    <form action={action} className="wishlist-control">
      <input type="hidden" name="productId" value={productId} />
      <button
        aria-label={state.saved ? "Remove from wishlist" : "Save to wishlist"}
        className={state.saved ? "saved" : ""}
        disabled={pending}
      >
        <Heart size={17} fill={state.saved ? "currentColor" : "none"} />
        <span>{pending ? "Saving…" : state.saved ? "Saved" : "Save"}</span>
      </button>
      {state.error && <small role="alert">{state.error}</small>}
    </form>
  );
}
