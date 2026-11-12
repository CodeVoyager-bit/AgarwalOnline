import { ViewTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { CentreCurrent } from "@/components/centre-current";
import { ArrowRight, SearchX } from "lucide-react";
import { catalog, catalogCategories, catalogSections, shelfPhotos } from "@/lib/catalog/queries";
import { categoryImages } from "@/lib/catalog/images";
import { AisleIcon } from "@/components/aisle-icon";
import { aisleDescription, aisleSummary, snippet } from "@/lib/seo";
import { ProductCard } from "@/components/product-card";
import { currentLocale } from "@/lib/i18n";
import { CatalogFilterPanel } from "@/components/catalog-filter-panel";
export const dynamic = "force-dynamic";
/** Products shown per "page"; Load more shows the next lot under them. */
const PAGE_SIZE = 48;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const category = (await catalogCategories()).find((item) => item.slug === params.category);
  if (params.q) return { title: `Results for “${params.q.slice(0, 60)}”`, robots: { index: false } };
  // sort and page only reorder the same list: one address per aisle for search engines
  if (category)
    return {
      title: `${category.en} online in Nagothane`,
      description: aisleDescription(category.en, await catalog({ category: category.slug })),
      alternates: { canonical: `/catalog?category=${category.slug}` },
    };
  if (params.sort === "discount") return { title: "Today’s offers and discounts", alternates: { canonical: "/catalog" } };
  const aisles = (await catalogCategories()).map((item) => item.en.toLowerCase());
  return {
    title: "All products",
    description: snippet(`All ${(await catalog()).length} products at Agarwal Online: ${aisles.slice(0, 6).join(", ")} and more.`),
    alternates: { canonical: "/catalog" },
  };
}
export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const locale = await currentLocale();
  const [products, categories, sections, photos] = await Promise.all([
    catalog(params),
    catalogCategories(),
    catalogSections(),
    shelfPhotos(),
  ]);
  const active = categories.find((category) => category.slug === params.category);
  // an aisle that was renamed or removed (a link Google or someone saved) used to show an empty page
  if (params.category && !active) permanentRedirect("/catalog");
  // The rail lists one section's shelves. A shelf can sit in several: `in` says which one the shopper
  // came through, else its first. Without sections, or on "All", the rail lists every shelf.
  const around = active ? sections.filter((section) => section.shelves.some((shelf) => shelf.slug === active.slug)) : [];
  const section = around.find((item) => item.slug === params.in) ?? around[0];
  const rail = section?.shelves ?? categories;
  const shelfHref = (slug: string, within?: string) =>
    `/catalog?${new URLSearchParams({ category: slug, ...(within ? { in: within } : {}) })}`;
  const allHref = "/catalog";
  const next = active ? rail[rail.findIndex((shelf) => shelf.slug === active.slug) + 1] : undefined;
  // sort and stock filters can be cleared without leaving the shelf; a search clears back to the whole shop
  const filtered = Boolean(params.q || params.inStock || params.sort);
  const summary = aisleSummary(products);
  // ?page=3 shows the first three pages' worth: a link that works without JavaScript, and can be shared
  const page = Math.max(1, Math.min(100, Math.floor(Number(params.page)) || 1));
  const shown = products.slice(0, page * PAGE_SIZE);
  const more = products.length - shown.length;
  const nextHref = `/catalog?${new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]) && entry[0] !== "page")),
    page: String(page + 1),
  })}`;
  return (
    <section className={`page-container shelves${params.q ? " searching" : ""}`}>
      {/* a search looks through the whole shop, so the sections and the rail step aside for it */}
      {!params.q && sections.length > 0 && (
        <nav className="section-tabs" aria-label={locale === "mr" ? "विभाग" : "Sections"}>
          <Link href={allHref} aria-current={!active ? "page" : undefined}>
            {locale === "mr" ? "सर्व" : "All"}
          </Link>
          {sections.map((item) => (
            <Link
              key={item.slug || "more"}
              href={shelfHref(item.shelves[0].slug, item.slug)}
              aria-current={section === item ? "true" : undefined}
            >
              {item[locale]}
            </Link>
          ))}
        </nav>
      )}
      {!params.q && (
        <nav className="shelf-rail" aria-label="Browse product categories">
          {sections.length === 0 && (
            <Link href={allHref} aria-current={!active ? "page" : undefined}>
              <span className="rail-art quiet">
                <AisleIcon slug="all" />
              </span>
              {locale === "mr" ? "सर्व" : "All"}
            </Link>
          )}
          {rail.map((shelf) => {
            const photo = categoryImages[shelf.slug] ?? photos.get(shelf.slug);
            return (
              <Link key={shelf.slug} href={shelfHref(shelf.slug, section?.slug)} aria-current={active?.slug === shelf.slug ? "page" : undefined}>
                <span className={photo ? "rail-art" : "rail-art quiet"}>
                  {photo ? <Image src={photo} alt="" fill sizes="56px" /> : <AisleIcon slug={shelf.slug} />}
                </span>
                {shelf[locale]}
              </Link>
            );
          })}
        </nav>
      )}
      <CentreCurrent key={`rail-${params.category ?? "all"}-${section?.slug ?? ""}`} rail=".shelf-rail" />
      <CentreCurrent key={`tabs-${section?.slug ?? "all"}`} rail=".section-tabs" />
      {/* picking another shelf swaps this part with a cross-fade: same place, different products */}
      <ViewTransition key={params.category ?? (params.q ? "search" : "all")} name="shelf-content" share="auto" enter="auto" default="none">
        <div className="shelf-main">
          <div className="shelf-head">
            <div>
              <h1>
                {active
                  ? active[locale]
                  : params.q
                    ? locale === "mr"
                      ? `“${params.q.slice(0, 60)}” साठी निकाल`
                      : `Results for “${params.q.slice(0, 60)}”`
                    : locale === "mr"
                      ? "सर्व उत्पादने"
                      : "All products"}
              </h1>
              {/* how many, then the aisle in a line from its own products: whose, and at what prices */}
              <p className="muted results-line">
                <span>
                  {more > 0 && (locale === "mr" ? `${shown.length} दाखवत आहोत, एकूण ` : `Showing ${shown.length} of `)}
                  <strong>{products.length}</strong> {locale === "mr" ? "उत्पादने" : products.length === 1 ? "product" : "products"}
                  {params.q ? (locale === "mr" ? ` “${params.q}” साठी` : ` for “${params.q}”`) : ""}
                  {active &&
                    !params.q &&
                    products.length > 0 &&
                    [
                      "",
                      summary.brands.slice(0, 3).join(", ") + (summary.brands.length > 3 ? "…" : ""),
                      // word joiners keep "₹90–₹240" on one line on a phone
                      summary.range.replace("–", "\u2060–\u2060"),
                    ]
                      .filter((part, index) => !index || part)
                      .join(" · ")}
                </span>
                {filtered && (
                  <Link href={active && !params.q ? shelfHref(active.slug, section?.slug) : allHref}>
                    {locale === "mr" ? "फिल्टर काढा" : "Clear filters"}
                  </Link>
                )}
              </p>
            </div>
            <CatalogFilterPanel locale={locale} params={params} />
          </div>
          {products.length ? (
            <>
              <div className="product-grid">
                {shown.map((p, index) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    locale={locale}
                    eager={index === 0}
                  />
                ))}
              </div>
              {more > 0 && (
                <div className="load-more">
                  {/* stays where it is: the next products appear under the ones already seen */}
                  <Link href={nextHref} scroll={false} className="secondary-button">
                    {locale === "mr"
                      ? `आणखी ${Math.min(more, PAGE_SIZE)} दाखवा`
                      : `Load ${Math.min(more, PAGE_SIZE)} more${more > PAGE_SIZE ? ` of ${more}` : ""}`}
                  </Link>
                </div>
              )}
              {/* the end of a shelf leads on to the next one in the rail */}
              {more <= 0 && next && !params.q && (
                <div className="load-more">
                  <Link href={shelfHref(next.slug, section?.slug)} className="secondary-button">
                    {locale === "mr" ? "पुढे" : "Next"}: {next[locale]} <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="panel empty-state">
              <SearchX size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
              <h2>{locale === "mr" ? "उत्पादने सापडली नाहीत" : "No products found"}</h2>
              <p>{locale === "mr" ? "इंग्रजी किंवा मराठीत दुसरे नाव वापरून पाहा, किंवा फिल्टर काढा." : "Try another name in English or Marathi, or clear your filters."}</p>
              <Link href={allHref} className="primary-button">
                {locale === "mr" ? "सर्व उत्पादने पाहा" : "Show all products"}
              </Link>
            </div>
          )}
        </div>
      </ViewTransition>
    </section>
  );
}
