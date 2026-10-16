import type { ReactNode } from "react";
import { ExportButton } from "./export-button";
import { tableMatrix } from "@/lib/table-export";
import type { Cell } from "@/lib/xlsx";

export type Column<T> = {
  /** Column heading, also used as the per-cell label once rows stack on phones. */
  header: string;
  cell: (row: T) => ReactNode;
  /** Set for numeric columns so they align right. */
  numeric?: boolean;
  /** "hide": left out of the phone's card, for details the record's own page shows anyway. */
  phone?: "hide";
  /** The value in the Excel export, when the cell's own words aren't it (a total as a number, say). */
  text?: (row: T) => Cell;
  /** false: left out of the Excel export. "Action" columns always are. */
  export?: boolean;
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
  exportName,
  exportRows,
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
  /** The Excel file's name (an Export button sits above every table); false for none. Defaults to the caption's start. */
  exportName?: string | false;
  /** Everything the filters matched, when the page shows only the first of them. */
  exportRows?: T[];
}) {
  if (!rows.length) return empty ?? null;
  return (
    <>
      {exportName !== false && (
        <div className="table-export-bar">
          <ExportButton name={exportName ?? caption.split(/[:;,(]/)[0].trim()} rows={tableMatrix(columns, exportRows ?? rows)} />
        </div>
      )}
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
    </>
  );
}
