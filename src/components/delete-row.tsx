import { ChevronRight, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { ActionForm } from "./action-form";
import { governanceAction } from "@/lib/governance/actions";

/**
 * The red row that deletes a pack or a whole product. An owner confirms and it happens; anyone else
 * says why and it waits for an owner. While open orders hold its stock it explains that instead.
 */
export function DeleteRow({
  target,
  id,
  owner,
  held,
  waiting,
  onHand,
  packs,
  group,
  whenHeld,
}: {
  target: "pack" | "product";
  id: string;
  owner: boolean;
  /** How many are held for open orders. */
  held: number;
  /** A request to delete it is already with an owner. */
  waiting: boolean;
  onHand: number;
  /** For a product: how many packs go with it. */
  packs?: number;
  /** The `name` of the rows this one closes when opened. */
  group?: string;
  /** Offered beside the "can't delete yet" message, like hiding it for now. */
  whenHeld?: ReactNode;
}) {
  const title = `Delete this ${target}`;
  const hidden = (
    <>
      <input type="hidden" name="operation" value="delete" />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="targetId" value={id} />
    </>
  );
  if (waiting)
    return (
      <div className="pack-setting-row is-danger">
        <Trash2 size={18} aria-hidden="true" />
        <span className="pack-setting-name">{title}</span>
        <span className="pack-setting-value">Waiting for owner</span>
      </div>
    );
  if (held > 0)
    return (
      <details className="pack-setting is-danger" name={group}>
        <summary>
          <Trash2 size={18} aria-hidden="true" />
          <span className="pack-setting-name">{title}</span>
          <span className="pack-setting-value">{held} held</span>
          <ChevronRight className="pack-setting-chevron" size={16} aria-hidden="true" />
        </summary>
        <div className="pack-setting-body">
          <p className="notice">
            Can’t delete this yet: {held} {held === 1 ? "is" : "are"} held for open orders. Deliver or cancel those orders first.
          </p>
          {whenHeld}
        </div>
      </details>
    );
  if (owner)
    return (
      <ActionForm
        action={governanceAction}
        submit={title}
        className="pack-delete-form"
        buttonClassName=""
        submitIcon={<Trash2 size={18} aria-hidden="true" />}
        danger
        confirmMessage={
          <ul className="confirm-list">
            {target === "product" && packs ? (
              <li>
                Its {packs === 1 ? "pack" : `${packs} packs`}
                {onHand > 0 ? ` and the ${onHand} in stock` : ""} go with it
              </li>
            ) : (
              onHand > 0 && <li>The {onHand} in stock are written off</li>
            )}
            <li>Gone from the shop, the Stock page and baskets</li>
            <li>Past orders, bills and quotations stay as they are</li>
          </ul>
        }
      >
        {hidden}
      </ActionForm>
    );
  return (
    <details className="pack-setting is-danger" name={group}>
      <summary>
        <Trash2 size={18} aria-hidden="true" />
        <span className="pack-setting-name">{title}</span>
        <span className="pack-setting-value">Owner decides</span>
        <ChevronRight className="pack-setting-chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="pack-setting-body">
        <ActionForm action={governanceAction} submit="Ask the owner to delete" buttonClassName="secondary-button">
          {hidden}
          <label>
            Why should it go? <small>The owner sees this</small>
            <input name="reason" minLength={5} maxLength={500} required />
          </label>
        </ActionForm>
      </div>
    </details>
  );
}
