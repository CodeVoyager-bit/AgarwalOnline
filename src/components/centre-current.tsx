"use client";
import { useEffect } from "react";

/** In a sideways rail (aisle chips, policy tabs on a phone), bring the current item to the middle. */
export function centreCurrent(railSelector: string) {
  const rail = document.querySelector<HTMLElement>(railSelector);
  const current = rail?.querySelector<HTMLElement>("[aria-current]");
  // the rail's own scroll only, so the page itself doesn't move
  if (rail && current)
    rail.scrollLeft +=
      current.getBoundingClientRect().left - rail.getBoundingClientRect().left - (rail.clientWidth - current.offsetWidth) / 2;
}

/** Give it a key that changes with the current item, so it runs again after a client-side navigation. */
export function CentreCurrent({ rail }: { rail: string }) {
  useEffect(() => centreCurrent(rail), [rail]);
  return null;
}
