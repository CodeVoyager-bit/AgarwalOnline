"use client";

import { Download } from "lucide-react";
import { xlsx, xlsxName, type Cell } from "@/lib/xlsx";

/** Saves a table as an Excel file, built on the device from what the table shows. */
export function ExportButton({ name, rows }: { name: string; rows: Cell[][] }) {
  return (
    <button
      type="button"
      className="text-button table-export"
      onClick={() => {
        const file = new Blob([new Uint8Array(xlsx([{ name, rows }]))], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = xlsxName(name);
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }}
    >
      <Download size={16} aria-hidden="true" /> Export to Excel
      <span className="sr-only">: {name}</span>
    </button>
  );
}
