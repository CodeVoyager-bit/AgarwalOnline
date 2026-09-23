"use client";
import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import type { MutationState } from "@/lib/commerce/actions";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function ActionForm({
  action,
  children,
  submit = "Save",
  className = "form-stack",
  confirmMessage,
}: {
  action: (state: MutationState, form: FormData) => Promise<MutationState>;
  children: React.ReactNode;
  submit?: string;
  className?: string;
  confirmMessage?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [confirming, setConfirming] = useState(false);
  const approved = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const messageId = useId();

  /** Close without submitting and hand focus back to whatever opened the dialog. */
  const dismiss = useCallback(() => {
    setConfirming(false);
    opener.current?.focus();
  }, []);

  // The dialog is `aria-modal`, so it has to behave like one: take focus on
  // open, keep Tab inside, and close on Escape. Before this it could only be
  // dismissed with a mouse.
  useEffect(() => {
    if (!confirming) return;
    opener.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirming, dismiss]);

  return (
    <>
      <form
        ref={formRef}
        action={dispatch}
        className={className}
        onSubmit={(event) => {
          if (confirmMessage && !approved.current) {
            event.preventDefault();
            setConfirming(true);
          }
          approved.current = false;
        }}
      >
        {children}
        {state.error && <p role="alert" className="error-message">{state.error}</p>}
        {state.success && <p role="status" className="success-message">{state.success}</p>}
        <button className="primary-button" disabled={pending} aria-busy={pending}>
          {pending ? "Please wait…" : submit}
        </button>
      </form>
      {confirming && (
        <div className="modal-backdrop" role="presentation" onMouseDown={dismiss}>
          <div
            ref={dialogRef}
            className="confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="eyebrow">Please review</span>
            <h2 id={titleId}>Confirm this action</h2>
            <p id={messageId}>{confirmMessage}</p>
            <div className="split-actions">
              <button type="button" className="secondary-button" onClick={dismiss}>
                Go back
              </button>
              <button
                ref={confirmRef}
                type="button"
                className="primary-button"
                onClick={() => {
                  approved.current = true;
                  setConfirming(false);
                  formRef.current?.requestSubmit();
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
