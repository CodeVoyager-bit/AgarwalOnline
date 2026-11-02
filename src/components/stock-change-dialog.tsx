"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, X } from "lucide-react";
import { ActionForm } from "./action-form";
import { governanceAction } from "@/lib/governance/actions";

const REASONS = {
  remove: ["Damaged", "Expired", "Count was wrong", "Back to supplier"],
  add: ["New delivery", "Returned by customer", "Count was wrong"],
};
const OTHER = "Other";

/**
 * Add to or remove from a pack's stock, with no minus sign to type. It opens from the page's
 * address (?pack=<id>&mode=remove), so a page has one dialog however many packs it lists and a
 * phone's back button closes it.
 */
export function StockChangeDialog({
  variantId,
  name,
  mode,
  onHand,
  reserved,
  owner,
  closeHref,
}: {
  variantId: string;
  name: string;
  mode: "add" | "remove";
  onHand: number;
  reserved: number;
  owner: boolean;
  closeHref: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [quantity, setQuantity] = useState("1");
  const [choice, setChoice] = useState("");
  const [other, setOther] = useState("");
  const [done, setDone] = useState("");
  const removing = mode === "remove";
  const most = removing ? Math.max(0, onHand - reserved) : 100000;
  const count = /^\d+$/.test(quantity) ? Number(quantity) : 0;
  const tooMany = count > most;
  const after = onHand + (removing ? -count : count);
  const shown = (next: number) => setQuantity(String(Math.min(most, Math.max(1, next))));

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      className="stock-dialog"
      aria-labelledby="stock-dialog-title"
      onClose={() => router.replace(closeHref, { scroll: false })}
      // a tap on the dimmed page around it lands on the dialog itself
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
    >
      <div className="stock-dialog-head">
        <h2 id="stock-dialog-title">{removing ? "Remove stock" : "Add stock"}</h2>
        <button type="button" className="stock-dialog-close" onClick={close} aria-label="Close">
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="muted">
        {name} · {onHand} on the shelf
        {reserved > 0 ? ` · ${reserved} held for orders` : ""}
      </p>
      {done ? (
        <div className="stock-done">
          <p role="status" className="success-message">
            {done}
          </p>
          <p className="muted">{onHand} on the shelf now.</p>
          <button type="button" className="primary-button" onClick={close}>
            Close
          </button>
        </div>
      ) : (
        <ActionForm
          action={governanceAction}
          submit={
            removing
              ? owner
                ? `Remove ${count || ""} from stock`
                : `Ask the owner to remove ${count || ""}`
              : `Add ${count || ""} to stock`
          }
          buttonClassName={removing ? "secondary-button danger-outline" : "primary-button"}
          disabled={!count || tooMany}
          onSuccess={setDone}
        >
          <input type="hidden" name="operation" value="stock" />
          <input type="hidden" name="variantId" value={variantId} />
          <input type="hidden" name="delta" value={removing ? -count : count} />
          <input type="hidden" name="reason" value={choice === OTHER ? other : choice} />
          <div className="stock-quantity">
            <button type="button" onClick={() => shown(count - 1)} aria-label="One less">
              <Minus size={18} aria-hidden="true" />
            </button>
            <label className="stock-quantity-box">
              <span className="sr-only">How many</span>
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoComplete="off"
              />
            </label>
            <button type="button" onClick={() => shown(count + 1)} aria-label="One more">
              <Plus size={18} aria-hidden="true" />
            </button>
            {removing && most > 1 && (
              <button type="button" onClick={() => setQuantity(String(most))}>
                All {most}
              </button>
            )}
          </div>
          <fieldset className="stock-reasons">
            <legend>Why?</legend>
            {[...REASONS[mode], OTHER].map((reason) => (
              <label key={reason}>
                <input
                  type="radio"
                  name="reasonChoice"
                  value={reason}
                  checked={choice === reason}
                  onChange={() => setChoice(reason)}
                  required
                />
                {reason}
              </label>
            ))}
          </fieldset>
          {choice === OTHER && (
            <label>
              Say why <small>The history shows this</small>
              <input value={other} onChange={(event) => setOther(event.target.value)} minLength={5} maxLength={500} required />
            </label>
          )}
          {tooMany ? (
            <p role="alert" className="error-message">
              Only {most} can be removed{reserved > 0 ? `: ${reserved} are held for open orders` : ""}.
            </p>
          ) : (
            count > 0 && (
              <p className="stock-result">
                {onHand} on the shelf → <strong>{after}</strong>
              </p>
            )
          )}
          {!owner && (
            <p className="muted">
              {removing ? "An owner approves this before the count changes." : "Large additions wait for an owner."}
            </p>
          )}
        </ActionForm>
      )}
    </dialog>
  );
}
