import type { ReactNode } from "react";

/**
 * The one page header for every surface. Replaces three competing patterns:
 * `workspace-heading`, `section-heading` used as a page title, and a bare
 * eyebrow + h1 dropped straight into the container.
 *
 * `.section-heading` keeps its real job, titling sections inside a page.
 */
export function PageHeading({
  eyebrow,
  title,
  lead,
  aside,
  id,
  lang,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Right-hand slot: a chip, a count, a back link. */
  aside?: ReactNode;
  id?: string;
  lang?: string;
}) {
  return (
    <div className="workspace-heading">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1 id={id} lang={lang}>
          {title}
        </h1>
        {lead ? <p>{lead}</p> : null}
      </div>
      {aside}
    </div>
  );
}
