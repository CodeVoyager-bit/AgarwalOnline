import Link from "next/link";

/** How many records a long staff list shows at a time. */
export const PAGE_ROWS = 30;

/** The rows to show for `?show=`: a page at first, more each time "Show more" is tapped. */
export function rowsShown(param: string | undefined) {
  const asked = Number(param);
  return Number.isInteger(asked) && asked > PAGE_ROWS ? Math.min(asked, 5000) : PAGE_ROWS;
}

/**
 * "Show 30 more" under a long staff list. The next records join the ones already on the page
 * (the link only raises `?show=`), and the search and filters in the address stay as they are.
 */
export function ShowMore({
  path,
  params,
  shown,
  total,
}: {
  path: string;
  params: Record<string, string | undefined>;
  shown: number;
  total: number;
}) {
  if (total <= shown) return null;
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]) && !["show", "adjust", "edit"].includes(entry[0])),
  );
  query.set("show", String(shown + PAGE_ROWS));
  return (
    <div className="load-more">
      <Link href={`${path}?${query}`} scroll={false} className="secondary-button">
        Show {Math.min(PAGE_ROWS, total - shown)} more ({total - shown} left)
      </Link>
    </div>
  );
}
