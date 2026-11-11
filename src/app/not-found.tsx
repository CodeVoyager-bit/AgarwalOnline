import Link from "next/link";
import { currentLocale } from "@/lib/i18n";
import { catalogCategories } from "@/lib/catalog/queries";

export default async function NotFound() {
  const [locale, aisles] = await Promise.all([currentLocale(), catalogCategories()]);
  const mr = locale === "mr";
  return (
    <div className="auth-card empty-state">
      <span className="eyebrow">404</span>
      <h1>{mr ? "हे पान सापडले नाही." : "We couldn’t find that page."}</h1>
      <p>{mr ? "पान हलवले असेल किंवा ही वस्तू आता दुकानात नसेल." : "The page may have moved or the item is no longer listed."}</p>
      <div className="split-actions utility-actions">
        <Link className="primary-button" href="/catalog">
          {mr ? "दुकान पाहा" : "Browse the store"}
        </Link>
        <Link className="secondary-button" href="/">
          {mr ? "मुख्य पानावर जा" : "Go home"}
        </Link>
      </div>
      {/* most people here followed an old link to a product or aisle: put the aisles one tap away */}
      {aisles.length > 0 && (
        <nav className="catalog-chips notfound-aisles" aria-label={mr ? "विभाग" : "Aisles"}>
          {aisles.map((aisle) => (
            <Link key={aisle.slug} href={`/catalog?category=${aisle.slug}`}>
              {aisle[locale]}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
