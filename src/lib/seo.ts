import type { CatalogItem } from "./catalog/queries";
import type { TaxProfile } from "./tax/gst";

const STORE = "Agarwal Online";

/** schema.org data as a script body; `<` escaped so a product name can never close the script tag. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** A product and its breadcrumb, as Google reads them for rich results. Uploaded photos are site-relative. */
export function productJsonLd(p: CatalogItem, origin: string, categoryName: string, photos: string[]) {
  const url = `${origin}/products/${p.slug}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name.en,
      description: p.description.en,
      url,
      category: categoryName,
      ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
      ...(photos.length ? { image: photos.map((src) => new URL(src, origin).href) } : {}),
      // verified-purchase reviews only; nothing is shown until there is one
      ...(p.reviewCount
        ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviewCount } }
        : {}),
      offers: p.variants.map((v) => ({
        "@type": "Offer",
        name: v.label,
        ...(v.sku ? { sku: v.sku } : {}),
        url,
        priceCurrency: "INR",
        price: (v.pricePaise / 100).toFixed(2),
        availability: `https://schema.org/${v.available > 0 ? "InStock" : "OutOfStock"}`,
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@type": "Organization", name: STORE },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: "All products", item: `${origin}/catalog` },
        { name: categoryName, item: `${origin}/catalog?category=${p.categorySlug}` },
        { name: p.name.en, item: url },
      ].map((crumb, i) => ({ "@type": "ListItem", position: i + 1, ...crumb })),
    },
  ] as const;
}

/** The shop itself, from the details the owner saved. No hours or map pin: the site doesn't store them. */
export function storeJsonLd(
  profile: Pick<TaxProfile, "legalName" | "address" | "phone" | "email">,
  areas: string[],
  origin: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: profile.legalName,
    url: origin,
    logo: `${origin}/icons/icon-512.png`,
    image: `${origin}/icons/icon-512.png`,
    ...(profile.phone ? { telephone: `+91${profile.phone}` } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: profile.address,
      addressLocality: "Nagothane",
      addressRegion: "Maharashtra",
      addressCountry: "IN",
    },
    areaServed: areas.map((name) => ({ "@type": "Place", name })),
  };
}
