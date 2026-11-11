import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import { AisleIcon } from "@/components/aisle-icon";
import { deliveryRules } from "@/lib/commerce/service";
import { categoryImages, productImages } from "@/lib/catalog/images";
import { catalog, catalogCategories, catalogSections, shelfPhotos } from "@/lib/catalog/queries";
import { ProductCard } from "@/components/product-card";
import { DeliveryPromise } from "@/components/delivery-promise";
import { currentUser } from "@/lib/auth/session";
import { currentLocale } from "@/lib/i18n";
import { Order } from "@/lib/commerce/models";
import { liveAreaFees, liveAreaNames } from "@/lib/commerce/areas";
import { homeFaq } from "@/lib/home-faq";
import { LegalText } from "@/components/legal-text";
import { familyOf } from "@/lib/family/service";
import { childKits } from "@/lib/family/kits";
import { classLabel } from "@/lib/family/models";
import { liveOffers, runningAt } from "@/lib/promotions/service";
import { discountPercent, formatPrice, minutesUntilCutoff } from "@/lib/display";
import { taxProfile } from "@/lib/tax/profile";
import { jsonLd, storeJsonLd, websiteJsonLd } from "@/lib/seo";
import { getEnv } from "@/lib/env";
import { paymentsEnabled } from "@/lib/payments/provider";
import { fill, frontWords, shopSettings } from "@/lib/settings/shop";
export const dynamic = "force-dynamic";
// the title and description are the root layout's; shared links with tracking tags fold into one address
export const metadata = { alternates: { canonical: "/" } };

const copy = {
  en: {
    dealEyebrow: "Biggest saving today",
    kitEyebrow: (name: string) => `For ${name}`,
    kitTitle: (className: string) => `${className} kit from the store`,
    kitCta: "See the kit",
    faces: "Popular in the shop",
    faq: "Questions people ask",
    faqMr: "नेहमीचे प्रश्न",
    productsCount: (n: number) => (n === 1 ? "1 product" : `${n} products`),
    pinLabel: "Check delivery at your PIN code",
    pinHint: "Six digits. Used only to check serviceability.",
    checkPin: "Check",
    freeFrom: (amount: string) => `Free delivery from ${amount}`,
    payment: (online: boolean) => (online ? "Cash on delivery or pay online" : "Cash on delivery"),
    benefitsLabel: "Delivery and payment facts",
    offers: "Offers running now",
    automatic: "Applied automatically at checkout",
    everyBasket: "on every basket",
    minimum: (amount: string) => `on baskets of ${amount} or more`,
    percentOff: (value: number) => `${value}% off`,
    amountOff: (amount: string) => `${amount} off`,
    aisles: "Shop by category",
    aislesMr: "विभागानुसार खरेदी",
    allAisles: (n: number) => `All ${n} categories`,
    usuals: "Your usuals",
    usualsTitle: "Buy it again",
    pastOrders: "Past orders",
    popular: "Popular in the shop",
    popularMr: "दुकानातील लोकप्रिय",
    seeAll: "See all",
    newIn: "New in store",
    newInMr: "दुकानात नवीन",
    storyEyebrow: "How delivery works",
    step1: (cutoff: string) => `Order before ${cutoff}`,
    step1Note: "Anything ordered after that goes out tomorrow.",
    step2: "Packed at the counter",
    step2Note: "By the same people who serve you in store.",
    step3: "At your door the same day",
    step3Note: (online: boolean) => (online ? "Pay in cash when it arrives, or online." : "Pay in cash when it arrives."),
  },
  mr: {
    dealEyebrow: "आजची सर्वात मोठी बचत",
    kitEyebrow: (name: string) => `${name} साठी`,
    kitTitle: (className: string) => `${className} शालेय संच`,
    kitCta: "संच पाहा",
    faces: "दुकानातील लोकप्रिय",
    faq: "नेहमीचे प्रश्न",
    faqMr: "Questions people ask",
    productsCount: (n: number) => `${n} उत्पादने`,
    pinLabel: "तुमच्या पिन कोडवर वितरण तपासा",
    pinHint: "सहा अंक. फक्त वितरण उपलब्धता तपासण्यासाठी.",
    checkPin: "तपासा",
    freeFrom: (amount: string) => `${amount} पासून मोफत वितरण`,
    payment: (online: boolean) => (online ? "रोख किंवा ऑनलाइन पेमेंट" : "वितरणावेळी रोख"),
    benefitsLabel: "वितरण आणि पेमेंट माहिती",
    offers: "सध्याच्या ऑफर",
    automatic: "चेकआउटला आपोआप लागू",
    everyBasket: "प्रत्येक बास्केटवर",
    minimum: (amount: string) => `${amount} किंवा अधिकच्या बास्केटवर`,
    percentOff: (value: number) => `${value}% सूट`,
    amountOff: (amount: string) => `${amount} सूट`,
    aisles: "विभागानुसार खरेदी",
    aislesMr: "Shop by category",
    allAisles: (n: number) => `सर्व ${n} विभाग`,
    usuals: "तुमच्या नेहमीच्या वस्तू",
    usualsTitle: "पुन्हा खरेदी करा",
    pastOrders: "मागील ऑर्डर",
    popular: "दुकानातील लोकप्रिय",
    popularMr: "Popular in the shop",
    seeAll: "सर्व पाहा",
    newIn: "दुकानात नवीन",
    newInMr: "New in store",
    storyEyebrow: "वितरण कसे चालते",
    step1: (cutoff: string) => `${cutoff} पूर्वी ऑर्डर करा`,
    step1Note: "त्यानंतरच्या ऑर्डर उद्या पाठवल्या जातात.",
    step2: "काउंटरवर पॅक",
    step2Note: "दुकानात तुम्हाला भेटणारी तीच माणसे.",
    step3: "त्याच दिवशी तुमच्या दारी",
    step3Note: (online: boolean) => (online ? "आल्यावर रोख द्या, किंवा ऑनलाइन." : "आल्यावर रोख द्या."),
  },
} as const;

/** Uniform aisle tile: square art above, bilingual label below. */
function AisleTile({
  category,
  locale,
  eager = false,
  fallback,
  within,
}: {
  category: { slug: string; en: string; mr: string };
  locale: "en" | "mr";
  eager?: boolean;
  /** An aisle without a chosen photo shows its most popular product's. */
  fallback?: string;
  /** The section the tile sits under: the shelf opens with that section's rail. */
  within?: string;
}) {
  const photo = categoryImages[category.slug] ?? fallback;
  const other = locale === "en" ? "mr" : "en";
  return (
    <Link
      href={`/catalog?${new URLSearchParams({ category: category.slug, ...(within ? { in: within } : {}) })}`}
      className={`aisle-tile ${photo ? "photo" : "quiet"}`}
    >
      <span className="aisle-art">
        {photo ? (
          <Image
            src={photo}
            alt=""
            fill
            sizes="(max-width: 760px) 25vw, (max-width: 1100px) 25vw, 200px"
            loading={eager ? "eager" : "lazy"}
          />
        ) : (
          <AisleIcon slug={category.slug} />
        )}
      </span>
      <span className="aisle-label">
        <strong lang={locale}>{category[locale]}</strong>
        <small lang={other}>{category[other]}</small>
      </span>
    </Link>
  );
}

function Section({
  id,
  title,
  subtitle,
  subtitleLang,
  link,
  linkLabel,
  count,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  /** the subtitle is usually the other language's name for the section */
  subtitleLang?: string;
  link: string;
  linkLabel: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className="section-heading">
        <div>
          <h2 id={id}>{title}</h2>
          <span className="muted" lang={subtitleLang}>
            {subtitle}
          </span>
        </div>
        <Link href={link}>
          {linkLabel}
          {count ? ` (${count})` : ""} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {children}
    </section>
  );
}

export default async function Home() {
  const now = new Date();
  const [products, newest, user, categories, sections, photos, locale, rules] = await Promise.all([
    catalog(),
    catalog({ sort: "new" }),
    currentUser(),
    catalogCategories(),
    catalogSections(),
    shelfPhotos(),
    currentLocale(),
    deliveryRules(),
  ]);
  // everything that only needs to know who's signed in, in one round
  const [family, activeOffers, areaDocs, previousOrder, shop, front, areaFees] = await Promise.all([
    user ? familyOf(user.id) : null,
    liveOffers().then((offers) => offers.filter(runningAt(now)).slice(0, 2)),
    liveAreaNames(),
    user ? Order.findOne({ customerId: user.id }).sort({ createdAt: -1 }).select("items.variantId") : null,
    taxProfile(),
    shopSettings("storefront"),
    liveAreaFees(),
  ]);
  const previousIds = new Set(
    previousOrder?.items.map((item: { variantId: unknown }) =>
      String(item.variantId),
    ) ?? [],
  );
  const buyAgain = products.filter((product) =>
    product.variants.some((variant) => previousIds.has(variant.id)),
  );
  const t = copy[locale];
  const online = paymentsEnabled();
  const cutoff = `${rules.cutoffHour % 12 || 12} ${rules.cutoffHour >= 12 ? "PM" : "AM"}`;
  const freeFrom = formatPrice(rules.freeThresholdPaise);
  const faq = homeFaq(locale, { areas: areaDocs, feesPaise: areaFees, cutoff, freeFromPaise: rules.freeThresholdPaise, online });
  // a child's class kit leads the page for their family: the first child whose school has one with us
  type Child = { _id: unknown; name: string; school: string; className: string; year: string };
  const pupils: Child[] = (family?.children ?? []).filter((child: Child) => child.school);
  const kits = pupils.length ? await childKits({ children: pupils }) : [];
  const kitChild = pupils.find((child) => kits.find((info) => info.childId === String(child._id))?.kit);
  const kit = kitChild ? kits.find((info) => info.childId === String(kitChild._id))!.kit! : null;
  const areas = areaDocs.join(" · ");
  const bestsellers = products.filter((product) => product.bestseller);
  const savings = products
    .map((product) => ({
      product,
      off: Math.max(
        ...product.variants.map((variant) =>
          discountPercent(variant.pricePaise, variant.mrpPaise),
        ),
      ),
    }))
    .filter((row) => row.off > 0)
    .sort((a, b) => b.off - a.off)
    .map((row) => row.product);
  // 16 card slots used to be filled by 11 products, with four of them repeated
  // across three rows. Each row now takes the next unshown item, so the
  // catalogue reads as deep as it actually is.
  const shown = new Set<string>();
  // Unsplash ids start with a timestamp: frames from one shoot share the seconds
  const photoOf = (product: (typeof products)[number]) =>
    (product.image ?? productImages[product.slug] ?? "").replace(/(photo-\d{10})[^?]*/, "$1").split("?")[0];
  // two products share one shoot in places; side by side they read as a bug
  const spread = (list: typeof products) => {
    const out: typeof products = [];
    const rest = [...list];
    while (rest.length) {
      const last = out[out.length - 1];
      const i = Math.max(0, rest.findIndex((p) => !last || photoOf(p) !== photoOf(last)));
      out.push(rest.splice(i, 1)[0]);
    }
    return out;
  };
  const take = (list: typeof products, count: number) => {
    const picked = list.filter((product) => !shown.has(product.id)).slice(0, count);
    for (const product of picked) shown.add(product.id);
    return spread(picked);
  };
  // the deal card needs a photograph; the rails skip whatever it features
  const deal = savings.find((product) => product.image ?? productImages[product.slug]);
  if (deal) shown.add(deal.id);
  const dealVariant = deal?.variants[0];
  const dealOff = dealVariant ? discountPercent(dealVariant.pricePaise, dealVariant.mrpPaise) : 0;
  const other = locale === "en" ? "mr" : "en";
  // the shop's map: every shelf under its section, a shelf repeated wherever it sits; one unnamed
  // group while the shop has no sections
  const groups = sections.length ? sections : [{ slug: "", en: "", mr: "", shelves: categories }];
  // with no kit and no deal to show, the welcome card carries four of the shop's own products
  const faces = (bestsellers.length ? bestsellers : products).filter((product) => product.image ?? productImages[product.slug]).slice(0, 4);
  const buyAgainRow = take(buyAgain, 5);
  const popular = take(bestsellers.length ? bestsellers : products, 10);
  const newRow = take(newest, 10);
  /** Accurate offer terms, built from the promotion record rather than written copy. */
  const describe = (offer: {
    discountType: string;
    discountValue: number;
    minimumSubtotalPaise: number;
  }) => {
    const amount =
      offer.discountType === "percentage"
        ? t.percentOff(offer.discountValue)
        : t.amountOff(formatPrice(offer.discountValue));
    const condition = offer.minimumSubtotalPaise
      ? t.minimum(formatPrice(offer.minimumSubtotalPaise))
      : t.everyBasket;
    return `${amount} ${condition}`;
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd([websiteJsonLd(getEnv().APP_ORIGIN), storeJsonLd(shop, areaDocs, getEnv().APP_ORIGIN)]) }}
      />
      <section className="welcome" aria-labelledby="welcome-title">
        <div className="welcome-words">
          <span className="hero-badge">{frontWords(front, "heroBadge", locale)}</span>
          <h1 id="welcome-title">
            {/* the owners' words from Customize → Shop front, or the shop's own */}
            {fill(frontWords(front, "heroTitle", locale), { cutoff })}{" "}
            <em>{fill(frontWords(front, "heroHighlight", locale), { cutoff })}</em>
          </h1>
          <p>{frontWords(front, "heroLead", locale)}</p>
          <DeliveryPromise cutoffHour={rules.cutoffHour} initialMinutes={minutesUntilCutoff(rules.cutoffHour, now)} locale={locale} />
        </div>
        {/* one slot beside the words: a child's class kit, else today's biggest saving, else the shop's own products */}
        {kit && kitChild ? (
          <Link href="/account/family" className="welcome-slot kit-slot">
            <span className="eyebrow">{t.kitEyebrow(kitChild.name)}</span>
            <strong>{t.kitTitle(classLabel(kitChild.className, locale === "mr"))}</strong>
            <span className="slot-line">
              {t.productsCount(kit.lines)} · {formatPrice(kit.totalPaise)}
            </span>
            <span className="slot-cta">
              {t.kitCta} <ArrowRight size={16} aria-hidden="true" />
            </span>
          </Link>
        ) : deal && dealVariant ? (
          <Link href={`/products/${deal.slug}?lang=${locale}`} className="welcome-slot deal-slot">
            <span className="slot-art">
              <Image src={deal.image ?? productImages[deal.slug]} alt="" fill sizes="(max-width: 760px) 30vw, 200px" priority />
            </span>
            <span className="eyebrow">{t.dealEyebrow}</span>
            <strong lang={locale}>{deal.name[locale]}</strong>
            <span className="slot-line">
              <b>{formatPrice(dealVariant.pricePaise)}</b> <del>{formatPrice(dealVariant.mrpPaise)}</del>{" "}
              <span className="deal-off">−{dealOff}%</span>
            </span>
          </Link>
        ) : (
          faces.length > 0 && (
            <ul className="welcome-slot faces-slot" aria-label={t.faces}>
              {faces.map((product) => (
                <li key={product.id}>
                  <Link href={`/products/${product.slug}?lang=${locale}`} aria-label={product.name[locale]}>
                    <Image src={product.image ?? productImages[product.slug]} alt="" fill sizes="(max-width: 760px) 15vw, 110px" priority />
                  </Link>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
      <div className="page-container home">
        <section className="section shop-map" aria-labelledby="aisles-title">
          <div className="section-heading">
            <div>
              <h2 id="aisles-title">{t.aisles}</h2>
              <span className="muted" lang={other}>
                {t.aislesMr}
              </span>
            </div>
            <Link href="/catalog">
              {t.seeAll} ({categories.length}) <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {groups.map((group, index) => (
            <div className={group.en ? `aisle-group tint-${(index % 5) + 1}` : "aisle-group"} key={group.slug || "all"}>
              {group.en && <h3 lang={locale}>{group[locale]}</h3>}
              <div className="aisles">
                {group.shelves.map((category, place) => (
                  <AisleTile
                    key={category.slug}
                    category={category}
                    locale={locale}
                    eager={index === 0 && place < 8}
                    fallback={photos.get(category.slug)}
                    within={group.slug || undefined}
                  />
                ))}
                {!group.en && (
                  <Link href="/catalog" className="aisle-tile quiet">
                    <span className="aisle-art">
                      <AisleIcon slug="all" />
                    </span>
                    <span className="aisle-label">
                      <strong>{t.allAisles(categories.length)}</strong>
                    </span>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </section>
        {buyAgainRow.length > 0 && (
          <Section
            id="again-title"
            title={t.usualsTitle}
            subtitle={t.usuals}
            link="/account/orders"
            linkLabel={t.pastOrders}
          >
            <div className="product-grid">
              {buyAgainRow.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  locale={locale}
                  eager={index < 5}
                />
              ))}
            </div>
          </Section>
        )}
        {popular.length > 0 && (
          <Section
            id="popular-title"
            title={t.popular}
            subtitle={t.popularMr}
            subtitleLang={other}
            link="/catalog"
            linkLabel={t.seeAll}
            count={products.length}
          >
            <div className="product-grid">
              {popular.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  locale={locale}
                  eager={!buyAgainRow.length && index < 5}
                />
              ))}
            </div>
          </Section>
        )}
        {activeOffers.length > 0 && (
          <section className="offer-ladder" aria-label={t.offers}>
            <span className="eyebrow">{t.offers}</span>
            <ul>
              {activeOffers.map(
                (offer: {
                  _id: unknown;
                  name: string;
                  code?: string;
                  discountType: string;
                  discountValue: number;
                  minimumSubtotalPaise: number;
                }) => (
                  <li key={String(offer._id)}>
                    <strong>{describe(offer)}</strong>
                    {offer.code ? (
                      <span className="offer-code">{offer.code}</span>
                    ) : (
                      <span className="muted">{t.automatic}</span>
                    )}
                  </li>
                ),
              )}
            </ul>
          </section>
        )}
        <div className="benefits" role="region" aria-label={t.benefitsLabel}>
        <div>
          <span className="benefit-icon">
            <Truck aria-hidden="true" />
          </span>
          <strong>{t.freeFrom(freeFrom)}</strong>
          {areas && <small>{areas}</small>}
        </div>
        <div>
          <span className="benefit-icon">
            <Wallet aria-hidden="true" />
          </span>
          <strong>{t.payment(online)}</strong>
          <small>{t.step3Note(online)}</small>
        </div>
        <div>
          <span className="benefit-icon">
            <Clock3 aria-hidden="true" />
          </span>
          <strong>{t.step1(cutoff)}</strong>
          <small>{t.step1Note}</small>
        </div>
        </div>
        <section className="delivery-steps" id="delivery" aria-labelledby="story-title">
          <div>
            <span className="eyebrow">{t.storyEyebrow}</span>
            <h2 id="story-title">{frontWords(front, "storyTitle", locale)}</h2>
            <p>{frontWords(front, "storyBody", locale)}</p>
          </div>
          <ol>
            <li>
              <Clock3 size={22} aria-hidden="true" />
              <strong>{t.step1(cutoff)}</strong>
              <small>{t.step1Note}</small>
            </li>
            <li>
              <Store size={22} aria-hidden="true" />
              <strong>{t.step2}</strong>
              <small>{t.step2Note}</small>
            </li>
            <li>
              <Truck size={22} aria-hidden="true" />
              <strong>{t.step3}</strong>
              <small>{t.step3Note(online)}</small>
            </li>
          </ol>
          <form className="pin-check" action="/serviceability">
            <label htmlFor="welcome-pin">{t.pinLabel}</label>
            <div>
              <input
                id="welcome-pin"
                name="pin"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="postal-code"
                aria-describedby="welcome-pin-hint"
                placeholder="402106"
                required
              />
              <button className="primary-button">{t.checkPin}</button>
            </div>
            <small className="muted" id="welcome-pin-hint">
              {t.pinHint}
            </small>
          </form>
        </section>
        {newRow.length > 0 && (
          <Section
            id="new-title"
            title={t.newIn}
            subtitle={t.newInMr}
            subtitleLang={other}
            link="/catalog?sort=new"
            linkLabel={t.seeAll}
          >
            <div className="product-grid">
              {newRow.map((product) => (
                <ProductCard key={product.id} product={product} locale={locale} />
              ))}
            </div>
          </Section>
        )}
        <section className="section home-faq" aria-labelledby="faq-title">
          <div className="section-heading">
            <div>
              <h2 id="faq-title">{t.faq}</h2>
              <span className="muted" lang={other}>
                {t.faqMr}
              </span>
            </div>
          </div>
          <div className="faq-list">
            {faq.map((item) => (
              <details className="faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p>
                  <LegalText text={item.a} mr={locale === "mr"} />
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
