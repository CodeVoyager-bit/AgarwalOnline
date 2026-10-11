import type { ReactNode } from "react";

export type Column<T> = {
  /** Column heading, also used as the per-cell label once rows stack on phones. */
  header: string;
  cell: (row: T) => ReactNode;
  /** Set for numeric columns so they align right. */
  numeric?: boolean;
  /** "hide": left out of the phone's card, for details the record's own page shows anyway. */
  phone?: "hide";
};

/**
 * One table that adapts, instead of a desktop table plus a duplicate card list.
 *
 * `/admin` used to emit every order into the DOM twice and hide one copy with a
 * media query. Here the rows themselves become cards on phones (760px and below): each cell
 * grows a label from `data-label`, so nothing is duplicated and the other five
 * admin tables stop scrolling sideways on a phone too.
 *
 * Roles are explicit because `display: block` on table elements otherwise drops
 * the table semantics in some browsers.
 */
export function DataTable<T,>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  bare = false,
  rowsOnPhone = false,
}: {
  /** Describes the table for screen readers; visually hidden. */
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Rendered instead of the table when there are no rows. */
  empty?: ReactNode;
  /** Omit the panel chrome when the table already sits inside one. */
  bare?: boolean;
  /** On phones, one line per record (title, then the remaining cells side by side, no labels)
   *  instead of a card: for short lists people scan, like the overview's latest orders. */
  rowsOnPhone?: boolean;
}) {
  if (!rows.length) return empty ?? null;
  return (
    <div className={`${bare ? "" : "panel "}table-scroll data-table${rowsOnPhone ? " rows-on-phone" : ""}`}>
      <table role="table">
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => (
              <th role="columnheader" scope="col" key={column.header} className={column.phone === "hide" ? "phone-hide" : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr role="row" key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  role="cell"
                  key={column.header}
                  data-label={column.header}
                  className={[column.numeric && "tnum", column.phone === "hide" && "phone-hide"].filter(Boolean).join(" ") || undefined}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
