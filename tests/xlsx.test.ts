import { describe, expect, it } from "vitest";
import { crc32, xlsx, xlsxName } from "../src/lib/xlsx";

/** The parts a zip holds, read back from its central directory. */
function entries(file: Uint8Array) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const end = file.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const parts = new Map<string, string>();
  let at = view.getUint32(end + 16, true);
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const size = view.getUint32(at + 20, true);
    const name = new TextDecoder().decode(file.subarray(at + 46, at + 46 + nameLength));
    const start = offset + 30 + view.getUint16(offset + 26, true);
    const data = file.subarray(start, start + size);
    expect(crc32(data)).toBe(view.getUint32(at + 16, true));
    parts.set(name, new TextDecoder().decode(data));
    at += 46 + nameLength;
  }
  return parts;
}

describe("Excel export", () => {
  it("computes the standard zip checksum", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes every part, with text escaped, numbers as numbers and tab names made unique", () => {
    const parts = entries(
      xlsx([
        { name: "Low stock", rows: [["Product", "Left"], ["Pens & <pencils>", 3], ["वही", null]] },
        { name: "Low stock", rows: [["x"]] },
      ]),
    );
    expect([...parts.keys()]).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]),
    );
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("Pens &amp; &lt;pencils&gt;");
    expect(sheet).toContain('<c r="B2"><v>3</v></c>');
    expect(sheet).toContain("वही");
    expect(parts.get("xl/workbook.xml")).toContain('name="Low stock 2"');
  });

  it("names files by title and the day in India", () => {
    expect(xlsxName("Low stock / today", new Date("2026-10-14T20:00:00Z"))).toBe("Low stock  today 2026-10-15.xlsx");
  });
});
