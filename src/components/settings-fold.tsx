"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
const currentHash = () => window.location.hash;

/**
 * On a phone, Store settings is a list of short sections: each shows its title and summary, and
 * its forms fold away until opened. Arriving at anything inside a section (the summary cards
 * above, the workspace search) opens it. Wider screens show every section open, as before; the
 * button and the folding only exist in the phone rules of globals.css.
 */
export function SettingsFold({ section, label }: { section: string; label: string }) {
  const hash = useSyncExternalStore(subscribe, currentHash, () => "");
  // a tap decides until the address points somewhere else
  const [choice, setChoice] = useState<{ hash: string; open: boolean } | null>(null);
  const target = typeof document !== "undefined" && hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  const linked = Boolean(target && document.getElementById(section)?.contains(target));
  const open = choice && choice.hash === hash ? choice.open : linked;
  useEffect(() => {
    document.getElementById(section)?.toggleAttribute("data-open", open);
    // the link scrolled to a part that was still folded away; now that it shows, bring it into view
    if (open && linked && target) target.scrollIntoView({ block: "start" });
  }, [section, open, linked, target]);
  return (
    <button
      type="button"
      className="settings-fold"
      aria-expanded={open}
      aria-controls={section}
      onClick={() => setChoice({ hash, open: !open })}
    >
      {open ? `Close ${label}` : `Open ${label}`}
      <ChevronDown size={16} aria-hidden="true" />
    </button>
  );
}
