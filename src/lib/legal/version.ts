/**
 * One version for all five policy pages. Bump it (to that day's date, with .2, .3 for another
 * change the same day) whenever their wording changes, never otherwise: checkout then asks for
 * the box to be ticked again, and every order keeps the version it was placed under. Earlier
 * wording stays in git history.
 *
 * 2026-10-10.2: family accounts and the family tab, children's details, push notifications and
 * the installable app, Hostinger for email.
 */
export const POLICY_VERSION = "2026-10-10.2";
export const LAST_UPDATED = { en: "10 October 2026", mr: "10 ऑक्टोबर 2026" } as const;
