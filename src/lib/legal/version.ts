/**
 * One version for all five policy pages. Bump it (to that day's date, with .2, .3 for another
 * change the same day) whenever their wording changes, never otherwise: checkout then asks for
 * the box to be ticked again, and every order keeps the version it was placed under. Earlier
 * wording stays in git history.
 *
 * 2026-10-10.2: family accounts and the family tab, children's details, push notifications and
 * the installable app, Hostinger for email.
 *
 * 2026-10-15.1: matched to the code again: 30-day sign-in sessions, MiniMoth sends codes by WhatsApp
 * or SMS, voice search through the browser, Google's sign-in tokens, sign-in attempt records,
 * prices include all taxes.
 *
 * 2026-10-16.1: only what is live: the family tab (khata) is gone, cash on delivery is the only way
 * to pay (no Razorpay text), and the switched-off shop assistant isn't mentioned. Shipping says
 * "shown above" only when an area list is above it.
 */
export const POLICY_VERSION = "2026-10-16.1";
export const LAST_UPDATED = { en: "16 October 2026", mr: "16 ऑक्टोबर 2026" } as const;
