import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export type NavTile = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

/**
 * The icon-and-description tile grid used by the two staff dashboards and the
 * account hub. "workspace" is the staff shape, "account" wraps the icon in a
 * `.account-tile-icon` bubble.
 */
export function NavTiles({
  items,
  label,
  variant = "workspace",
}: {
  items: NavTile[];
  /** Accessible name for the nav landmark. */
  label: string;
  variant?: "workspace" | "account";
}) {
  const account = variant === "account";
  return (
    <nav className={account ? "dashboard-links" : "workspace-actions"} aria-label={label}>
      {items.map(({ href, title, description, icon: Icon }) => (
        <Link className={account ? "account-tile" : undefined} href={href} key={href}>
          {account ? (
            <span className="account-tile-icon">
              <Icon size={22} aria-hidden="true" />
            </span>
          ) : (
            <Icon size={21} aria-hidden="true" />
          )}
          <span>
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
          <ArrowUpRight size={account ? 18 : 17} aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
