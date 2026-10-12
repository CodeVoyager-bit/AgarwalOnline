"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * On a slow connection a tapped link shows nothing until the next page arrives, so people tap
 * again or give up. This bar starts the moment a link or a search form is used and finishes when
 * the address changes; the tapped link is marked `data-pending` so it can answer too.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const bar = useRef<HTMLDivElement>(null);
  const link = useRef<Element | null>(null);
  const giveUp = useRef(0);

  // the new page is here
  useEffect(() => {
    const el = bar.current;
    if (el?.dataset.state === "loading") el.dataset.state = "done";
    link.current?.removeAttribute("data-pending");
    link.current = null;
    clearTimeout(giveUp.current);
  }, [pathname, search]);

  useEffect(() => {
    const start = (from: Element | null) => {
      const el = bar.current;
      if (!el) return;
      link.current?.removeAttribute("data-pending");
      link.current = from;
      from?.setAttribute("data-pending", "");
      el.dataset.state = "";
      void el.offsetWidth; // restart the trickle when a second link is tapped mid-way
      el.dataset.state = "loading";
      clearTimeout(giveUp.current);
      // a download or a cancelled navigation never changes the address
      giveUp.current = window.setTimeout(() => {
        el.dataset.state = "done";
        link.current?.removeAttribute("data-pending");
      }, 15000);
    };
    const leavesPage = (url: URL) =>
      url.origin === location.origin &&
      !/\.\w{2,4}$/.test(url.pathname) && // files, the app download
      (url.pathname !== location.pathname || url.search !== location.search); // not a jump within the page

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const a = (event.target as Element).closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      if (leavesPage(new URL(a.href))) start(a);
    };
    // search boxes and the PIN check are plain GET forms
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      if (event.defaultPrevented || form.method.toLowerCase() !== "get") return;
      // a GET form always loads a page, even its own address with new filters
      if (new URL(form.action, location.href).origin === location.origin) start(event.submitter);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  return <div ref={bar} className="nav-progress" aria-hidden="true" />;
}
