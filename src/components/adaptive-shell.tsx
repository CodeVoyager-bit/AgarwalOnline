"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BadgeIndianRupee,
  Boxes,
  ChartNoAxesCombined,
  ClipboardCheck,
  Headphones,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  UserCog,
  UserRound,
  UsersRound,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Activity;
  /** Sibling routes that should keep this entry highlighted. */
  also?: string[];
};
type NavGroup = { label: string; items: NavItem[] };

const operations: NavGroup = {
  label: "Operations",
  items: [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    {
      href: "/admin/products",
      label: "Catalog & stock",
      icon: Boxes,
      also: ["/admin/categories", "/admin/inventory"],
    },
    { href: "/admin/customers", label: "Customers", icon: UsersRound },
    { href: "/admin/cod", label: "COD desk", icon: BadgeIndianRupee },
    { href: "/admin/support", label: "Support", icon: Headphones },
    { href: "/admin/complaints", label: "Aftercare", icon: MessageSquareWarning },
    { href: "/admin/reviews", label: "Reviews", icon: Sparkles },
    { href: "/admin/analytics", label: "Analytics", icon: ChartNoAxesCombined },
  ],
};
const governance: NavGroup = {
  label: "Governance",
  items: [
    { href: "/super-admin", label: "Control centre", icon: ShieldCheck },
    { href: "/super-admin/staff", label: "Staff & roles", icon: UserCog },
    { href: "/super-admin/approvals", label: "Approvals", icon: ClipboardCheck },
    { href: "/super-admin/promotions", label: "Promotions", icon: Sparkles },
    { href: "/super-admin/refunds", label: "Refunds", icon: BadgeIndianRupee },
    { href: "/super-admin/audit", label: "Audit trail", icon: Activity },
  ],
};
const delivery: NavGroup = {
  label: "Delivery",
  items: [{ href: "/delivery", label: "My deliveries", icon: Truck }],
};
const roots = new Set(["/admin", "/super-admin", "/delivery"]);

export function AdaptiveShell({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isGovernance = pathname.startsWith("/super-admin");
  const isDelivery = pathname.startsWith("/delivery");
  const isStaff = isGovernance || isDelivery || pathname.startsWith("/admin");
  if (!isStaff)
    return (
      <>
        {header}
        <main id="main">{children}</main>
        {footer}
      </>
    );
  const groups = isDelivery
    ? [delivery]
    : isGovernance
      ? [governance, operations]
      : [operations];
  const home = isGovernance ? "/super-admin" : isDelivery ? "/delivery" : "/admin";
  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <Link href={home} className="ops-brand">
          <span className="brand-mark" aria-hidden="true">
            <Store size={18} />
          </span>
          <span>
            Agarwal
            <small>{isGovernance ? "Governance" : isDelivery ? "Delivery" : "Operations"}</small>
          </span>
        </Link>
        <Link href="/account" className="ops-account-mini" aria-label="Account and sign out">
          <UserRound size={20} />
        </Link>
        <nav aria-label="Staff workspace" className="ops-nav">
          {groups.map((group) => (
            <div className="ops-group" key={group.label}>
              <span className="ops-group-label">{group.label}</span>
              {group.items.map(({ href, label, icon: Icon, also }) => {
                const active =
                  href === pathname ||
                  (!roots.has(href) && pathname.startsWith(`${href}/`)) ||
                  (also ?? []).some(
                    (sibling) =>
                      sibling === pathname || pathname.startsWith(`${sibling}/`),
                  );
                return (
                  <Link key={href} href={href} aria-current={active ? "page" : undefined}>
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="ops-foot">
          <Link href="/">
            <Store size={18} aria-hidden="true" />
            <span>Storefront</span>
          </Link>
          <Link href="/account">
            <LogOut size={18} aria-hidden="true" />
            <span>Account &amp; sign out</span>
          </Link>
        </div>
      </aside>
      <main id="main" className="ops-main">
        {children}
      </main>
    </div>
  );
}
