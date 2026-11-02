"use client";

import { Fragment } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/lib/auth/permissions";
import type { Locale } from "@/lib/locale-types";
import { isStaffPath } from "@/lib/staff/paths";
import { isSchoolPath } from "@/lib/schools/paths";
import type { StaffUser } from "./staff-header";

// shoppers never download the staff header, menu and search
const StaffChrome = dynamic(() => import("./staff-chrome"));

/**
 * Shop pages get the storefront header; staff pages get their own header, search and menu
 * (see StaffChrome); the school marketplace gets its own from its layout. The root layout
 * doesn't re-render on navigation, so the choice is made here from the path, which changes as
 * people move between the shop, the school marketplace and the workspace.
 *
 * The slots stay inside their own keyed Fragments, never directly in the lists below. Signing in or
 * out sends new slots that stream in one by one, while the list here changes shape. If React had to
 * wait for a slot in this list, it could resume with the old children already marked for removal and
 * mark them again, then remove them twice and crash the page (tests/e2e/shell-switch.spec.ts). In a
 * Fragment, the wait happens in the Fragment, and this list has finished by then.
 */
export function AdaptiveShell({
  header,
  footer,
  staffFooter,
  staffRole,
  staffUser,
  locale,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  /** The staff pages' one-line footer. */
  staffFooter: React.ReactNode;
  staffRole: StaffRole | null;
  staffUser: StaffUser | null;
  locale: Locale;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (staffRole && staffUser && isStaffPath(pathname))
    return (
      <StaffChrome role={staffRole} user={staffUser} locale={locale} footer={staffFooter}>
        {children}
      </StaffChrome>
    );
  // the school marketplace brings its own header, main and tab bar (src/app/school/layout.tsx)
  if (isSchoolPath(pathname))
    return (
      <>
        <Fragment key="page">{children}</Fragment>
        <Fragment key="footer">{footer}</Fragment>
      </>
    );
  return (
    <>
      <Fragment key="header">{header}</Fragment>
      <main key="main" id="main">
        {children}
      </main>
      <Fragment key="footer">{footer}</Fragment>
    </>
  );
}
