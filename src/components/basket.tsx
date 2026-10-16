"use client";
import Link from "next/link";
import { createContext, use, useMemo, useOptimistic, useState } from "react";
import { ShoppingBag } from "lucide-react";

export type BasketLines = Record<string, { quantity: number; pricePaise: number }>;
export type BasketChange = { variantId: string; quantity: number; pricePaise: number };
/** A change the store confirmed, with the server's clock at the moment it was saved. */
type Saved = BasketChange & { at: number };

function apply(lines: BasketLines, { variantId, quantity, pricePaise }: BasketChange) {
  const next = { ...lines };
  if (quantity > 0) next[variantId] = { quantity, pricePaise };
  else delete next[variantId];
  return next;
}

/** The stored basket a page was rendered with, plus the saves this page confirmed after it was read. */
export function basketAfter(server: BasketLines, at: number, confirmed: Record<string, Saved>) {
  return Object.values(confirmed)
    .filter((change) => change.at > at)
    .reduce(apply, server);
}

const BasketContext = createContext<{
  lines: BasketLines;
  preview: (change: BasketChange) => void;
  commit: (change: BasketChange, at: number) => void;
}>({ lines: {}, preview() {}, commit() {} });

/** The basket as the client sees it, so a tap updates every card and count without re-rendering the page. */
export function BasketProvider({
  lines: server,
  at,
  children,
}: {
  lines: BasketLines;
  /** When the server read that basket, by its clock. */
  at: number;
  children: React.ReactNode;
}) {
  // A server re-render (product page, basket page, sign-in) carries the stored basket, and it wins
  // over every save confirmed before it was read. A save confirmed after it still counts: the
  // refresh that the first tap's new basket cookie causes is read before the taps that follow it
  // are saved, and arrives after them. It used to put the basket back to that first tap.
  const [confirmed, setConfirmed] = useState<Record<string, Saved>>({});
  const saved = useMemo(() => basketAfter(server, at, confirmed), [server, at, confirmed]);
  const [lines, preview] = useOptimistic(saved, apply);
  const commit = (change: BasketChange, savedAt: number) =>
    setConfirmed((prev) => ({ ...prev, [change.variantId]: { ...change, at: savedAt } }));
  return <BasketContext value={{ lines, preview, commit }}>{children}</BasketContext>;
}

export function useBasket() {
  const basket = use(BasketContext);
  const all = Object.values(basket.lines);
  return {
    ...basket,
    count: all.reduce((sum, line) => sum + line.quantity, 0),
    totalPaise: all.reduce((sum, line) => sum + line.quantity * line.pricePaise, 0),
  };
}

export function BasketLink({ label }: { label: string }) {
  const { count } = useBasket();
  return (
    <Link
      href="/cart"
      className="cart-button"
      title={label}
      aria-label={count > 0 ? `${label}, ${count}` : label}
    >
      <ShoppingBag size={20} aria-hidden="true" />
      {count > 0 && <b aria-hidden="true" key={count}>{count}</b>}
    </Link>
  );
}
