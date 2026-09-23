"use client";

import { usePathname } from "next/navigation";
import { setLocaleAction } from "@/lib/locale-action";
import type { Locale } from "@/lib/locale-types";

export function LocaleToggle({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const returnTo = pathname;
  return (
    <form
      action={setLocaleAction}
      className="locale-toggle"
      aria-label="Language"
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <button name="locale" value="en" aria-pressed={locale === "en"}>
        English
      </button>
      <button name="locale" value="mr" aria-pressed={locale === "mr"}>
        मराठी
      </button>
    </form>
  );
}
