import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { productImages } from "@/lib/catalog/images";
import type { CatalogItem } from "@/lib/catalog/queries";
import { inStock, type Related } from "@/lib/catalog/related-rules";
import type { Locale } from "@/lib/locale-types";
import { BoughtTogether } from "./bought-together";
import { MiniProduct } from "./mini-product";

const WORDS = {
  en: {
    together: "Often bought together",
    mayLike: "You may also like",
    popularCategory: "Popular in this category",
    popularShop: "Popular in our shop",
    inCategory: (name: string) => `In ${name}`,
    similar: "Similar items",
    browse: "Browse the shop",
    others: "Other items",
    seeAll: "See all",
  },
  mr: {
    together: "अनेकदा एकत्र घेतल्या जातात",
    mayLike: "तुम्हाला हेही आवडेल",
    popularCategory: "या विभागात लोकप्रिय",
    popularShop: "आमच्या दुकानात लोकप्रिय",
    inCategory: (name: string) => `${name} मध्ये`,
    similar: "अशाच वस्तू",
    browse: "दुकानात पाहा",
    others: "इतर वस्तू",
    seeAll: "सर्व पाहा",
  },
};

function Row({
  id,
  eyebrow,
  title,
  items,
  locale,
  link,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  items: CatalogItem[];
  locale: Locale;
  link?: { href: string; label: string };
}) {
  if (!items.length) return null;
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section-heading">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={id}>{title}</h2>
        </div>
        {link && (
          <Link href={link.href}>
            {link.label} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className="mini-grid related-row">
        {items.map((item) => (
          <MiniProduct key={item.id} product={item} locale={locale} />
        ))}
      </div>
    </section>
  );
}

/** The bottom of a product page: what's bought with it (or what's popular, until sales can say), what's like it, and the rest of the shop. */
export function RelatedRows({
  product,
  rows,
  categoryName,
  locale,
}: {
  product: CatalogItem;
  rows: Related;
  categoryName: string;
  locale: Locale;
}) {
  const words = WORDS[locale];
  const line = (item: CatalogItem, current = false) => {
    const pack = item.variants.find((variant) => variant.available > 0) ?? item.variants[0];
    return {
      variantId: pack.id,
      pricePaise: pack.pricePaise,
      slug: item.slug,
      name: item.name[locale],
      image: item.image ?? productImages[item.slug],
      categorySlug: item.categorySlug,
      current,
    };
  };
  return (
    <>
      {rows.together.length > 0 && inStock(product) ? (
        <section className="section" aria-labelledby="together-title">
          <div className="section-heading">
            <div>
              <h2 id="together-title">{words.together}</h2>
            </div>
          </div>
          <BoughtTogether lines={[line(product, true), ...rows.together.map((item) => line(item))]} locale={locale} />
        </section>
      ) : (
        <Row id="together-title" title={words.together} items={rows.together} locale={locale} />
      )}
      <Row
        id="popular-title"
        eyebrow={words.mayLike}
        title={rows.popularScope === "category" ? words.popularCategory : words.popularShop}
        items={rows.popular}
        locale={locale}
      />
      <Row
        id="similar-title"
        eyebrow={words.inCategory(categoryName)}
        title={words.similar}
        items={rows.similar}
        locale={locale}
      />
      <Row
        id="others-title"
        eyebrow={words.browse}
        title={words.others}
        items={rows.others}
        locale={locale}
        link={{ href: "/catalog", label: words.seeAll }}
      />
    </>
  );
}
