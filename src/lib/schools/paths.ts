/** The school marketplace: everything at or under /school has its own header and tab bar. */
export function isSchoolPath(pathname: string) {
  return pathname === "/school" || pathname.startsWith("/school/");
}

/** Where /school/use may send someone after choosing a school: only back into the school area. */
export function safeSchoolPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.includes("//") || /[\\\x00-\x1f\x7f]/.test(value)) return "/school";
  // read as an address, so what goes into the Location header is encoded (a Marathi search, say)
  let url: URL;
  try {
    url = new URL(value, "http://shop.invalid");
  } catch {
    return "/school";
  }
  if (url.origin !== "http://shop.invalid" || !isSchoolPath(url.pathname)) return "/school";
  return url.pathname + url.search;
}

/** "/school/catalog?q=chalk": a path with only the query values that are set. */
export function withQuery(path: string, values: Record<string, string | undefined>) {
  const query = new URLSearchParams(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return query ? `${path}?${query}` : path;
}
