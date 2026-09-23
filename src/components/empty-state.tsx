import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A designed empty state. The `.empty-state` rules (icon, heading, body, CTA)
 * already existed but only the basket used them; every other list wrote its own
 * bare sentence.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  heading = "h2",
}: {
  icon?: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  /** A link or button styled with `primary-button` / `secondary-button`. */
  action?: ReactNode;
  /** Use "h3" when the state sits beneath an existing section heading. */
  heading?: "h2" | "h3";
}) {
  const Heading = heading;
  return (
    <div className="panel empty-state">
      {Icon ? (
        <Icon size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
      ) : null}
      <Heading>{title}</Heading>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}
