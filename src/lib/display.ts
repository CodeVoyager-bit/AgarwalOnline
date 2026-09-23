const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Paise → "₹1,234.5" (no trailing zeros, Indian digit grouping). */
export function formatPrice(paise: number) {
  return inr.format(paise / 100);
}

/** Whole-number discount percentage, 0 when there is no saving. */
export function discountPercent(pricePaise: number, mrpPaise: number) {
  return mrpPaise > pricePaise
    ? Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100)
    : 0;
}

export function displayStatus(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Minutes left before the same-day cutoff, in the store's timezone (IST).
 * Negative once the cutoff has passed. Server and client agree because both
 * read the wall clock in Asia/Kolkata rather than the host timezone.
 */
export function minutesUntilCutoff(cutoffHour: number, now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const at = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return cutoffHour * 60 - (at("hour") * 60 + at("minute"));
}

/** 134 → "2h 14m" / "2 ता 14 मि", 45 → "45m" / "45 मि". */
export function formatDuration(minutes: number, locale: "en" | "mr" = "en") {
  const whole = Math.max(0, minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const [h, m] = locale === "mr" ? [" ता", " मि"] : ["h", "m"];
  return hours ? `${hours}${h} ${rest}${m}` : `${whole}${m}`;
}

/** The store's wall clock. Replaces the same toLocaleString call copied across nine files. */
export function formatIst(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    ...options,
  });
}
