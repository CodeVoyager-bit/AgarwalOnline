import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { asNumber, plainText, tableMatrix } from "../src/lib/table-export";
import { displayStatus } from "../src/lib/display";

describe("Table export", () => {
  it("reads the words in a cell, dates behind <When> and statuses behind pills", () => {
    const When = (props: { at: Date }) => props.at.toISOString();
    const Pill = (props: { value?: string; children?: string }) => props.children ?? props.value;
    expect(plainText(h("span", null, h("a", { href: "/x" }, "Classmate"), h("small", null, "Pack of 3 · ", h("code", null, "ST-026"))))).toBe(
      "Classmate Pack of 3 ·  ST-026",
    );
    expect(plainText(h(When, { at: new Date("2026-10-14T15:30:00Z") }))).toBe("14 Oct 2026, 9:00 pm");
    expect(plainText(h(Pill, { value: "out-for-delivery" }))).toBe(displayStatus("out-for-delivery"));
    expect(plainText(h("form", null, h("input", { type: "hidden", value: "abc" }), h("button", null, "Adjust")))).toBe(" ");
  });

  it("never reads a client component's type, which the server isn't allowed to touch", () => {
    // what <Image> or <Link> looks like to a server component: a reference that throws when read
    const clientReference = new Proxy(() => null, {
      get(_, key) {
        throw Error(`Cannot access Image.${String(key)} on the server`);
      },
    });
    const element = (type: unknown, props: object) => ({ $$typeof: Symbol.for("react.transitional.element"), type, key: null, props });
    expect(plainText(element(clientReference, { alt: "" }) as never)).toBe("");
    expect(plainText(element(clientReference, { href: "/products/x", children: "Classmate" }) as never)).toBe("Classmate");
  });

  it("turns money and counts into numbers Excel can add up", () => {
    expect(asNumber("₹1,234.50")).toBe(1234.5);
    expect(asNumber("−3")).toBe(-3);
    expect(asNumber("Sold out")).toBe("Sold out");
  });

  it("leaves out action columns and uses a column's own export value", () => {
    const rows = [{ name: "Pens", total: 12000 }];
    expect(
      tableMatrix(
        [
          { header: "Product", cell: (row: (typeof rows)[number]) => h("strong", null, row.name) },
          { header: "Total", numeric: true, cell: (row: (typeof rows)[number]) => `₹${row.total / 100}`, text: (row) => row.total / 100 },
          { header: "Left", numeric: true, cell: () => "  7 " },
          { header: "Action", cell: () => h("a", { href: "/edit" }, "Edit") },
          { header: "Note", cell: () => "secret", export: false },
        ],
        rows,
      ),
    ).toEqual([
      ["Product", "Total", "Left"],
      ["Pens", 120, 7],
    ]);
  });
});
