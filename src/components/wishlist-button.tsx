"use client";

import { useActionState } from "react";
import { Heart } from "lucide-react";
import { wishlistAction } from "@/lib/engagement/actions";
import { safeAction } from "./safe-action";

const toggleSaved = safeAction(wishlistAction);

export function WishlistButton({
  productId,
  name,
  saved = false,
  mr = false,
}: {
  productId: string;
  /** Product name, so a list of Save buttons reads as distinct controls to a screen reader. */
  name: string;
  saved?: boolean;
  mr?: boolean;
}) {
  const [state, action, pending] = useActionState(toggleSaved, { saved });
  return (
    <form action={action} className="wishlist-control">
      <input type="hidden" name="productId" value={productId} />
      <button
        aria-label={
          mr
            ? state.saved
              ? `${name} आवडत्या यादीतून काढा`
              : `${name} आवडत्या यादीत जतन करा`
            : state.saved
              ? `Remove ${name} from wishlist`
              : `Save ${name} to wishlist`
        }
        aria-pressed={state.saved}
        className={state.saved ? "saved" : ""}
        disabled={pending}
      >
        <Heart size={17} fill={state.saved ? "currentColor" : "none"} />
        <span>
          {pending ? (mr ? "जतन होत आहे…" : "Saving…") : state.saved ? (mr ? "जतन केले" : "Saved") : mr ? "जतन करा" : "Save"}
        </span>
      </button>
      {state.error && <small role="alert">{state.error}</small>}
    </form>
  );
}
