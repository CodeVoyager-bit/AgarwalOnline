import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The GET filter bar above admin lists. Three pages wrote this by hand with no
 * accessible name; a filter form that screen readers announce as just "form"
 * is hard to find in a long page.
 */
export function FilterBar({
  label,
  children,
  submitLabel = "Show results",
  clearHref,
  clearLabel = "Clear",
}: {
  /** Accessible name, e.g. "Filter customers". */
  label: string;
  /** The labelled inputs and selects. */
  children: ReactNode;
  submitLabel?: string;
  /** Omit when there is nothing to reset to. */
  clearHref?: string;
  clearLabel?: string;
}) {
  return (
    <form className="audit-filters" role="search" aria-label={label}>
      {children}
      <button className="primary-button">{submitLabel}</button>
      {clearHref ? (
        <Link className="secondary-button" href={clearHref}>
          {clearLabel}
        </Link>
      ) : null}
    </form>
  );
}
