/** The two loopback spellings that address the same local machine. */
const LOOPBACK = ["localhost", "127.0.0.1"];

function parse(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Same-origin guard for form posts, protecting against cross-site submission.
 *
 * The comparison is exact, with one exception: `localhost` and `127.0.0.1` are
 * treated as the same host when the configured origin is itself loopback. Next
 * prints `http://localhost:3000` on startup while `APP_ORIGIN` is commonly
 * `http://127.0.0.1:3000`, and without this every sign-in from the printed URL
 * fails. `env.ts` requires a production `APP_ORIGIN` to be https, so a real
 * deployment can never take this branch.
 */
export function isAllowedOrigin(origin: string | null, allowed: string) {
  if (!origin) return false;
  if (origin === allowed) return true;
  const from = parse(origin);
  const to = parse(allowed);
  if (!from || !to) return false;
  if (!LOOPBACK.includes(from.hostname) || !LOOPBACK.includes(to.hostname))
    return false;
  return from.protocol === to.protocol && from.port === to.port;
}

/** Every spelling of a local origin, for allow-lists that cannot call a predicate. */
export function originVariants(allowed: string) {
  const url = parse(allowed);
  if (!url || !LOOPBACK.includes(url.hostname)) return [allowed];
  return LOOPBACK.map((hostname) => {
    const variant = new URL(allowed);
    variant.hostname = hostname;
    return variant.origin;
  });
}
