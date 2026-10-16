import Link from "next/link";
import { MapPin } from "lucide-react";
import { LocaleToggle } from "./locale-toggle";
import type { CategoryLink } from "./header";
import type { Locale } from "@/lib/locale-types";
import { LEGAL_PAGES, POLICIES_HOME } from "@/lib/legal/pages";

export function SiteFooter({
  locale,
  categories,
  areas,
  offers = false,
  signedIn = false,
  workspace = null,
  compact = false,
}: {
  locale: Locale;
  categories: CategoryLink[];
  /** The areas switched on in Store settings. */
  areas: string[];
  /** Something sells below MRP, so "Deals" has something to show. */
  offers?: boolean;
  /** Someone is signed in: the footer offers their account, not "Sign in". */
  signedIn?: boolean;
  /** A staff member's workspace home, linked from the footer. */
  workspace?: string | null;
  /** The staff pages' one line: the shop's columns are for shoppers. */
  compact?: boolean;
}) {
  const mr = locale === "mr";
  if (compact)
    return (
      <footer className="site-footer is-compact">
        <div className="footer-base">
          <div className="footer-base-inner">
            <p>© {new Date().getFullYear()} Agarwal Online</p>
            <p>
              <Link href="/">{mr ? "दुकान पाहा" : "View shop"}</Link>
              {" · "}
              <Link href={POLICIES_HOME.href}>{mr ? "धोरणे" : "Policies"}</Link>
            </p>
          </div>
        </div>
      </footer>
    );
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link href="/" className="brand" aria-label="Agarwal Online, home">
            Agarwal<small>Online</small>
          </Link>
          <p>
            {mr
              ? "नागोठण्यातील तुमच्या ओळखीच्या दुकानातून लेखन साहित्य, शालेय वस्तू, खेळणी आणि खेळ."
              : "Stationery, school supplies, toys and games from your neighbourhood store in Nagothane."}
          </p>
          {areas.length > 0 && (
            <p className="footer-areas">
              <MapPin size={14} aria-hidden="true" />
              {mr ? "वितरण: " : "Delivering to "}
              {areas.join(" · ")}
            </p>
          )}
        </div>
        <nav className="footer-shop" aria-label={mr ? "खरेदी" : "Shop"}>
          <h2>{mr ? "खरेदी" : "Shop"}</h2>
          <ul>
            {categories.map((category) => (
              <li key={category.slug}>
                <Link href={`/catalog?category=${category.slug}`}>
                  {category[locale]}
                </Link>
              </li>
            ))}
            {offers && (
              <li>
                <Link href="/catalog?sort=discount">{mr ? "खास ऑफर" : "Deals"}</Link>
              </li>
            )}
          </ul>
        </nav>
        <nav aria-label={mr ? "मदत" : "Help"}>
          <h2>{mr ? "मदत" : "Help"}</h2>
          <ul>
            <li>
              <Link href="/serviceability">
                {mr ? "वितरण क्षेत्र तपासा" : "Check delivery area"}
              </Link>
            </li>
            <li>
              <Link href="/app">{mr ? "ॲप मिळवा" : "Get the app"}</Link>
            </li>
            <li>
              <Link href="/account/orders">{mr ? "तुमच्या ऑर्डर" : "Your orders"}</Link>
            </li>
            <li>
              <Link href="/account/support">
                {mr ? "दुकानाशी बोला" : "Talk to the store"}
              </Link>
            </li>
            <li>
              <Link href="/account/complaints">
                {mr ? "तक्रारी आणि परतावा" : "Complaints & returns"}
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={mr ? "धोरणे" : "Policies"}>
          <h2>{mr ? "धोरणे" : "Policies"}</h2>
          <ul>
            {LEGAL_PAGES.map((page) => (
              <li key={page.key}>
                <Link href={page.href}>{page.title[locale]}</Link>
              </li>
            ))}
            <li>
              <Link href={POLICIES_HOME.href}>{mr ? "सर्व धोरणे" : "All policies"}</Link>
            </li>
          </ul>
        </nav>
        <div className="footer-store">
          <h2>{mr ? "दुकान" : "Store"}</h2>
          <ul>
            {signedIn ? (
              <>
                <li>
                  <Link href="/account">{mr ? "माझे खाते" : "Your account"}</Link>
                </li>
                {workspace && (
                  <li>
                    <Link href={workspace}>{mr ? "कामाचे पान" : "Staff workspace"}</Link>
                  </li>
                )}
              </>
            ) : (
              <>
                <li>
                  <Link href="/login">{mr ? "साइन इन" : "Sign in"}</Link>
                </li>
                <li>
                  <Link href="/login">{mr ? "कर्मचारी साइन इन" : "Staff sign in"}</Link>
                </li>
              </>
            )}
          </ul>
          <LocaleToggle locale={locale} />
        </div>
      </div>
      <div className="footer-base">
        <div className="footer-base-inner">
          <p>© {new Date().getFullYear()} Agarwal Online</p>
        </div>
      </div>
    </footer>
  );
}
