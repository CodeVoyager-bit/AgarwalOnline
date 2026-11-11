"use client";
import { useEffect } from "react";

/** In a rail that scrolls sideways (section tabs, policy tabs on a phone) or down (the shelf rail), bring the current item to the middle. */
export function centreCurrent(railSelector: string) {
  const rail = document.querySelector<HTMLElement>(railSelector);
  const current = rail?.querySelector<HTMLElement>("[aria-current]");
  if (!rail || !current) return;
  // the rail's own scroll only, so the page itself doesn't move
  const [at, box] = [current.getBoundingClientRect(), rail.getBoundingClientRect()];
  rail.scrollLeft += at.left - box.left - (rail.clientWidth - current.offsetWidth) / 2;
  rail.scrollTop += at.top - box.top - (rail.clientHeight - current.offsetHeight) / 2;
}

/** Give it a key that changes with the current item, so it runs again after a client-side navigation. */
export function CentreCurrent({ rail }: { rail: string }) {
  useEffect(() => centreCurrent(rail), [rail]);
  return null;
}
