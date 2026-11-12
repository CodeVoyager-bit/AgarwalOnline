"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Settings, one section at a time. The menu's rows are plain #links, so the address says which
 * section is open, Back closes it, and every old link to a part of a section (the workspace search,
 * the bell, bookmarks) opens that section. On a phone the menu and the open section take turns; on a
 * wide screen the menu stays beside it, and the first section shows until another is picked.
 */
export function SettingsShell({ initial, children }: { initial?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = ref.current;
    if (!shell) return;
    const choose = (section: Element | null) => {
      for (const pane of shell.querySelectorAll("[data-settings-section]")) pane.toggleAttribute("data-current", pane === section);
      shell.toggleAttribute("data-chosen", Boolean(section));
      for (const link of shell.querySelectorAll<HTMLAnchorElement>(".settings-menu a")) {
        if (section && link.hash === `#${section.id}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    };
    const fromHash = (moved: boolean) => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      const section = target && shell.contains(target) ? target.closest("[data-settings-section]") : null;
      if (target && section) {
        choose(section);
        if (moved) {
          target.scrollIntoView({ block: "start" });
          target.focus({ preventScroll: true });
        }
        return true;
      }
      // no hash, or the shell itself (the "All settings" link): back to the list
      if (moved && (!target || target === shell)) {
        choose(null);
        window.scrollTo({ top: 0 });
      }
      return false;
    };
    if (!fromHash(false) && initial) choose(document.getElementById(initial));
    const onHash = () => fromHash(true);
    // the workspace search and the bell light up a part of a section (hash-target.tsx): open it first
    const onReveal = (event: Event) => choose((event.target as Element).closest("[data-settings-section]"));
    window.addEventListener("hashchange", onHash);
    shell.addEventListener("ags:reveal", onReveal);
    return () => {
      window.removeEventListener("hashchange", onHash);
      shell.removeEventListener("ags:reveal", onReveal);
    };
  }, [initial]);
  return (
    <div className="settings-shell" id="settings" ref={ref} tabIndex={-1}>
      {children}
    </div>
  );
}
