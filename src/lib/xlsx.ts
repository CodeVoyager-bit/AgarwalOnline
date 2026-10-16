/**
 * Excel workbooks (.xlsx) without a library: an .xlsx file is a zip of a few XML parts. Pure and
 * runs in the browser too, so the Export buttons build their file on the device and the emailed
 * stock report uses the same code. Header row bold and frozen, columns sized to their content.
 */
export type Cell = string | number | null | undefined;
export type Sheet = { name: string; rows: Cell[][] };

const enc = new TextEncoder();
const esc = (text: string) =>
  text
    // characters XML 1.0 can't carry at all
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const column = (index: number): string => (index < 26 ? "" : column(Math.floor(index / 26) - 1)) + String.fromCharCode(65 + (index % 26));

function sheetXml(rows: Cell[][]) {
  const widths: number[] = [];
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === null || value === undefined || value === "") return "";
          const text = String(value);
          widths[c] = Math.max(widths[c] ?? 0, Math.min(60, text.length + 2));
          const ref = `${column(c)}${r + 1}`;
          const style = r === 0 ? ' s="1"' : "";
          return typeof value === "number" && Number.isFinite(value)
            ? `<c r="${ref}"${style}><v>${value}</v></c>`
            : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, w)}" customWidth="1"/>`).join("")}</cols>`
    : "";
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `${cols}<sheetData>${body}</sheetData></worksheet>`
  );
}

// zip, stored (no compression): spreadsheets this size don't need it, and it keeps this short
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const DOS_DATE = 0x21; // 1 Jan 1980: some unzip tools reject an all-zero date
function zip(files: [name: string, data: string][]) {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    // signature, version 2.0, flags (bit 11: UTF-8 names), stored, 1 Jan 1980, crc, sizes, name length
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [12, DOS_DATE, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nameBytes.length, 2]].forEach(
      ([at, value, size]) => (size === 4 ? local.setUint32(at, value, true) : local.setUint16(at, value, true)),
    );
    const entry = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [14, DOS_DATE, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nameBytes.length, 2], [42, offset, 4]].forEach(
      ([at, value, size]) => (size === 4 ? entry.setUint32(at, value, true) : entry.setUint16(at, value, true)),
    );
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4]].forEach(([at, value, bytes]) =>
    bytes === 4 ? end.setUint32(at, value, true) : end.setUint16(at, value, true),
  );
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A workbook with one tab per sheet; the first row of each is its header. */
export function xlsx(sheets: Sheet[]): Uint8Array {
  // Excel's rules for tab names: 31 characters, none of []:*?/\, each name once
  const names: string[] = [];
  for (const sheet of sheets) {
    const base = sheet.name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Sheet";
    let name = base;
    for (let n = 2; names.includes(name); n++) name = `${base} ${n}`;
    names.push(name);
  }
  const ns = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  const doc = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const ct = "application/vnd.openxmlformats-officedocument.spreadsheetml";
  return zip([
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        `<Override PartName="/xl/workbook.xml" ContentType="${ct}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${ct}.styles+xml"/>` +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${ct}.worksheet+xml"/>`).join("") +
        "</Types>",
    ],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ${ns}><Relationship Id="rId1" Type="${doc}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${doc}"><sheets>` +
        names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        "</sheets></workbook>",
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ${ns}>` +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${doc}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="${doc}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    ],
    ...sheets.map((sheet, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet.rows)]),
  ]);
}

/** A file name that is safe everywhere: "Low stock 2026-10-14.xlsx". */
export const xlsxName = (title: string, date = new Date()) =>
  `${title.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "Export"} ${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date)}.xlsx`;
