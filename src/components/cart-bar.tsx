"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { formatPrice } from "@/lib/display";
import { copy, type Locale } from "@/lib/locale-types";
import { useBasket } from "./basket";

/** Sticky basket summary on phones (quick-commerce pattern); hidden where it would be redundant. */
export function CartBar({ locale, freeFromPaise }: { locale: Locale; /** Baskets from this much are delivered free; left out when the shop doesn't say so. */ freeFromPaise?: number }) {
  const { count, totalPaise } = useBasket();
  const pathname = usePathname();
  // the moment the basket reaches free delivery is told to the look (src/components/playful.tsx), once per crossing
  const isFree = freeFromPaise !== undefined && count > 0 && totalPaise >= freeFromPaise;
  const wasFree = useRef(isFree);
  useEffect(() => {
    if (isFree && !wasFree.current) document.dispatchEvent(new Event("basket:free"));
    wasFree.current = isFree;
  }, [isFree]);
  const quiet = ["/cart", "/checkout", "/staff", "/admin", "/super-admin", "/delivery", "/school"];
  if (count === 0 || quiet.some((p) => pathname.startsWith(p))) return null;
  const text = copy[locale];
  // how far the basket is from free delivery, said where the shopper is already looking
  const free = freeFromPaise === undefined ? "" : isFree ? text.freeNow : text.freeMore(formatPrice(freeFromPaise - totalPaise));
  return (
    <Link
      href="/cart"
      className={isFree ? "cart-bar is-free" : "cart-bar"}
      aria-label={`${text.items(count)}, ${formatPrice(totalPaise)}. ${free ? `${free}. ` : ""}${text.viewBasket}`}
    >
      <span>
        {/* keyed on their values so each change is a fresh element the look can animate */}
        <b key={`${count}-${free && totalPaise}`}>
          {text.items(count)}
          {free && ` · ${formatPrice(totalPaise)}`}
        </b>
        {free ? (
          <small key={free} className="cart-free">
            {free}
          </small>
        ) : (
          <small key={totalPaise}>{formatPrice(totalPaise)}</small>
        )}
      </span>
      <span>
        {text.viewBasket} <ArrowRight size={16} aria-hidden="true" />
      </span>
    </Link>
  );
}
