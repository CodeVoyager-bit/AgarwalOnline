/**
 * What may leave the shop for Google Analytics. Google's terms forbid personal details, and some
 * pages carry a secret in their address, so every page address and link is cleaned first.
 */

/** Pages whose last part is someone's secret link: shared lists, family invites, school joins, quotations. */
const SECRET_AFTER = ["/family/", "/lists/", "/school/join/", "/q/"];
/** Query values worth seeing in reports (searches, filters, campaign tags); the rest are dropped. */
const KEEP = /^(q|category|sort|pick|lang|utm_(source|medium|campaign|term|content))$/;

/** Masks what reads like an email address or a phone number. */
export function scrub(text: string) {
  return text.replace(/\S+@\S+\.\S+/g, "[email]").replace(/\+?\d[\d\s-]{8,}\d/g, "[number]");
}

/** A page address safe to hand Google: secret codes masked, only harmless query values, no #part. */
export function cleanUrl(href: string, origin: string) {
  const url = new URL(href, origin);
  // tel:, mailto: and the like: which kind is enough
  if (!/^https?:$/.test(url.protocol)) return url.protocol;
  // another site: its address alone
  if (url.origin !== origin) return url.origin;
  const secret = SECRET_AFTER.find((prefix) => url.pathname.startsWith(prefix));
  const path = secret ? `${secret}:code` : url.pathname;
  const query = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (KEEP.test(key)) query.append(key, scrub(value));
  });
  const rest = query.toString();
  return `${origin}${path}${rest ? `?${rest}` : ""}`;
}
