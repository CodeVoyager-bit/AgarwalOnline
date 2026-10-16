import { isValidElement, type ReactNode } from "react";
import type { Cell } from "./xlsx";
import { displayStatus } from "./display";

/** "14 Oct 2026, 9:30 pm": a date in a spreadsheet is the exact time in India, not "3 h ago". */
const ist = (date: Date) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(date);

/**
 * The words a table cell shows, for its spreadsheet copy: text inside links, pills and the like,
 * and the date behind a <When at>. Pure, so it runs while the server renders the table.
 */
export function plainText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return String(node);
  if (node instanceof Date) return ist(node);
  if (Array.isArray(node)) return node.map(plainText).join(" ");
  if (isValidElement(node)) {
    // form fields in a cell (hidden ids, buttons) are not data. Only plain tags are named by a
    // string: a client component's type is a reference the server must not read (not even toString)
    if (typeof node.type === "string" && ["input", "button", "select", "textarea", "script", "svg"].includes(node.type)) return "";
    const props = node.props as { children?: ReactNode; at?: Date | string; value?: unknown; rating?: unknown };
    // components that draw their words from a prop: <When at>, <StatusPill value>, <Stars rating>
    if (props.children === undefined) {
      if (props.at !== undefined) return ist(new Date(props.at));
      if (typeof props.value === "string") return displayStatus(props.value);
      if (typeof props.rating === "number") return `${props.rating} of 5`;
    }
    return plainText(props.children);
  }
  return "";
}

/** "₹1,234.50" → 1234.5, "−3" → -3; anything else stays text. Lets Excel add up money columns. */
export function asNumber(text: string): Cell {
  const bare = text.replace(/[₹,\s]/g, "").replace(/^[−–]/, "-");
  return /^[+-]?\d+(\.\d+)?$/.test(bare) ? Number(bare) : text;
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** Header and rows for a spreadsheet, from the same columns the table draws. */
export function tableMatrix<T>(
  columns: { header: string; cell: (row: T) => ReactNode; numeric?: boolean; text?: (row: T) => Cell; export?: boolean }[],
  rows: T[],
): Cell[][] {
  // buttons and links to act on a row aren't data
  const kept = columns.filter((column) => column.export !== false && !/^actions?$/i.test(column.header));
  return [
    kept.map((column) => column.header),
    ...rows.map((row) =>
      kept.map((column) => {
        if (column.text) return column.text(row);
        const text = clean(plainText(column.cell(row)));
        return column.numeric ? asNumber(text) : text;
      }),
    ),
  ];
}
