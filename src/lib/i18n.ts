import "server-only";
import type { Locale } from "./locale-types";

/**
 * The site is English only (2026-11-12): the language switch is gone and an old "ags_locale" cookie is
 * ignored. The Marathi words still in the dictionaries are never shown.
 */
export async function currentLocale(): Promise<Locale> {
  return "en";
}
