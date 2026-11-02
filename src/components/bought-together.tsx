"use client";
import { Fragment, startTransition, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { quickAddAction } from "@/lib/commerce/actions";
import { formatPrice } from "@/lib/display";
import type { Locale } from "@/lib/locale-types";
import { AisleIcon } from "./aisle-icon";
import { useBasket, type BasketChange } from "./basket";

export type TogetherLine = {
  variantId: string;
  pricePaise: number;
  slug: string;
  name: string;
  image?: string;
  categorySlug: string;
  /** The item the page is about. */
  current?: boolean;
};

const WORDS = {
  en: {
    addAll: (n: number) => (n === 1 ? "Add 1" : n === 2 ? "Add both" : `Add all ${n}`),
    addSome: (n: number) => `Add ${n}`,
    adding: "Adding…",
    choose: "Choose an item",
    basket: "View basket",
    inBasket: "In basket",
    current: "This item",
    include: (name: string) => `Include ${name}`,
    offline: "Could not reach the store. Check your connection and try again.",
  },
  mr: {
    addAll: (n: number) => (n === 1 ? "1 वस्तू जोडा" : n === 2 ? "दोन्ही जोडा" : `सर्व ${n} जोडा`),
    addSome: (n: number) => `${n} वस्तू जोडा`,
    adding: "जोडत आहे…",
    choose: "एक वस्तू निवडा",
    basket: "बास्केट पाहा",
    inBasket: "बास्केटमध्ये",
    current: "ही वस्तू",
    include: (name: string) => `${name} निवडा`,
    offline: "दुकानाशी संपर्क झाला नाही. तुमचे कनेक्शन तपासून पुन्हा प्रयत्न करा.",
  },
};

/**
 * "Often bought together": this item and what people order with it, ticked to start with, and one
 * button for the lot. Each line shows in the basket at once and is saved behind it, one after
 * another; a line the store refuses rolls back with its reason.
 */
export function BoughtTogether({ lines, locale }: { lines: TogetherLine[]; locale: Locale }) {
  const words = WORDS[locale];
  const { lines: basket, preview, commit } = useBasket();
  const [unticked, setUnticked] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [saving, start] = useTransition();
  const inBasket = (line: TogetherLine) => (basket[line.variantId]?.quantity ?? 0) > 0;
  const open = lines.filter((line) => !inBasket(line));
  const chosen = open.filter((line) => !unticked.includes(line.variantId));
  const total = chosen.reduce((sum, line) => sum + line.pricePaise, 0);

  function addChosen() {
    const changes: BasketChange[] = chosen.map((line) => ({
      variantId: line.variantId,
      quantity: 1,
      pricePaise: line.pricePaise,
    }));
    start(async () => {
      changes.forEach((change) => preview(change));
      const saved: [BasketChange, number][] = [];
      let refused: string | undefined;
      for (const change of changes) {
        const form = new FormData();
        form.set("variantId", change.variantId);
        form.set("quantity", String(change.quantity));
        const result = await quickAddAction({}, form).catch((): { error: string; at?: number } => ({
          error: words.offline,
        }));
        if (result.error) refused ??= `${lines.find((line) => line.variantId === change.variantId)?.name}: ${result.error}`;
        else saved.push([change, result.at ?? Date.now()]);
      }
      startTransition(() => {
        setError(refused);
        saved.forEach(([change, at]) => commit(change, at));
      });
    });
  }

  return (
    <div className="together-box" aria-busy={saving}>
      <div className="together-art" aria-hidden="true">
        {lines.map((line, index) => (
          <Fragment key={line.variantId}>
            {index > 0 && <span className="together-plus">+</span>}
            <span className="together-photo">
              {line.image ? (
                <Image src={line.image} alt="" fill sizes="120px" className="product-photo" />
              ) : (
                <AisleIcon slug={line.categorySlug} />
              )}
            </span>
          </Fragment>
        ))}
      </div>
      <ul className="together-lines">
        {lines.map((line) => (
          <li key={line.variantId}>
            {inBasket(line) ? (
              <span className="together-tick together-done">
                <Check size={18} aria-hidden="true" />
              </span>
            ) : (
              <label className="together-tick">
                <input
                  type="checkbox"
                  aria-label={words.include(line.name)}
                  checked={!unticked.includes(line.variantId)}
                  onChange={(event) =>
                    setUnticked((now) =>
                      event.target.checked ? now.filter((id) => id !== line.variantId) : [...now, line.variantId],
                    )
                  }
                />
              </label>
            )}
            <span className="together-name">
              {line.current ? line.name : <Link href={`/products/${line.slug}`}>{line.name}</Link>}
              {inBasket(line) ? <small>{words.inBasket}</small> : line.current && <small>{words.current}</small>}
            </span>
            <span className="together-price">{formatPrice(line.pricePaise)}</span>
          </li>
        ))}
      </ul>
      <div className="together-buy">
        {saving ? (
          <button type="button" className="primary-button" disabled>
            {words.adding}
          </button>
        ) : chosen.length ? (
          <button type="button" className="primary-button" onClick={addChosen}>
            {chosen.length === open.length ? words.addAll(chosen.length) : words.addSome(chosen.length)} · {formatPrice(total)}
          </button>
        ) : open.length < lines.length ? (
          <Link href="/cart" className="secondary-button">
            {words.basket}
          </Link>
        ) : (
          <button type="button" className="primary-button" disabled>
            {words.choose}
          </button>
        )}
        {error && (
          <span role="alert" className="error-message">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
