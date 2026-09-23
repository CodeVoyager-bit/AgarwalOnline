"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/admin/products", "Products"],
  ["/admin/products/new", "Add product"],
  ["/admin/categories", "Categories"],
  ["/admin/inventory", "Inventory"],
] as const;

export function CatalogAdminNav() {
  const pathname = usePathname();
  return (
    <nav className="catalog-admin-nav" aria-label="Catalog workspaces">
      {links.map(([href, label]) => (
        <Link
          href={href}
          key={href}
          aria-current={pathname === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
