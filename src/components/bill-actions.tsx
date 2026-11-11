"use client";
import { useState } from "react";
import { Download, Printer, Share2 } from "lucide-react";

type Bill = { key: string };

const query = (bill: Bill, estimate: boolean, extra: Record<string, string> = {}) => {
  const params = new URLSearchParams({
    ...(bill.key !== "agarwal" ? { bill: bill.key } : {}),
    ...(estimate ? { kind: "estimate" } : {}),
    ...extra,
  }).toString();
  return params ? `?${params}` : "";
};
/** The file name the server gives the PDF: "Agarwal-bill-20261107-00012.pdf". */
const nameFrom = (response: Response, fallback: string) =>
  /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;

/**
 * Print bill, and Share PDF on WhatsApp, for one bill or all of an order's bills. On a phone (and in the
 * Android app, which runs on Chrome) the PDFs go to the phone's share list, where WhatsApp is. On a computer
 * a website can't hand WhatsApp a file, so the PDFs are saved and WhatsApp Web opens with a view-only link
 * to the bills: on the customer's own chat when staff send it (`phone`).
 */
export function BillActions({
  orderId,
  orderNumber,
  bills,
  estimate = false,
  compact = false,
  printHref,
  phone,
}: {
  orderId: string;
  orderNumber: string;
  bills: Bill[];
  /** The kaccha bill (staff, before delivery). */
  estimate?: boolean;
  /** Two icon buttons, for a row in the order history. */
  compact?: boolean;
  /** With more than one bill, Print goes here to pick one (the order page's bills). */
  printHref?: string;
  /** Staff sending to the customer: their 10-digit number. */
  phone?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState<File[] | null>(null);
  const what = estimate ? "kaccha bill" : bills.length > 1 ? "bills" : "bill";
  const text = estimate
    ? `Kaccha bill (estimate) for order ${orderNumber}.`
    : `${bills.length > 1 ? "Bills" : "Bill"} for order ${orderNumber}.`;

  function print() {
    if (bills.length > 1 && printHref) {
      window.location.href = printHref;
      return;
    }
    window.open(`/api/invoices/${orderId}${query(bills[0], estimate, { view: "1", print: "1" })}`, "_blank", "noopener");
  }

  async function makeFiles() {
    return Promise.all(
      bills.map(async (bill, index) => {
        const response = await fetch(`/api/invoices/${orderId}/pdf${query(bill, estimate)}`, { credentials: "same-origin" });
        if (!response.ok) throw new Error(await response.text().catch(() => "pdf"));
        const name = nameFrom(response, `Bill-${orderNumber}${bills.length > 1 ? `-${index + 1}` : ""}.pdf`);
        return new File([await response.blob()], name, { type: "application/pdf" });
      }),
    );
  }

  function save(files: File[]) {
    for (const file of files) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    }
  }

  async function share() {
    if (ready) {
      await navigator.share({ files: ready, text }).catch(() => undefined);
      return;
    }
    const onPhone = window.matchMedia("(pointer: coarse)").matches;
    // opened on the tap itself, so a popup blocker lets WhatsApp Web through after the PDF is made
    const tab = onPhone ? null : window.open("about:blank", "_blank");
    setBusy(true);
    setStatus(`Making the ${what} PDF…`);
    try {
      const files = await makeFiles();
      if (!tab && navigator.canShare?.({ files })) {
        try {
          await navigator.share({ files, text });
          setStatus("");
        } catch (error) {
          // making the PDF took longer than the browser allows a share to wait: the next tap shares it
          if (error instanceof Error && error.name === "NotAllowedError") {
            setReady(files);
            setStatus("Your PDF is ready. Tap Share PDF on WhatsApp again to send it.");
          } else setStatus("");
        }
        return;
      }
      save(files);
      const response = await fetch(`/api/invoices/${orderId}/link`, { method: "POST", credentials: "same-origin" });
      const link = response.ok ? ((await response.json()) as { url?: string }).url : undefined;
      const url = `https://wa.me/${phone && /^\d{10}$/.test(phone) ? `91${phone}` : ""}?text=${encodeURIComponent(`${text}${link ? ` ${link}` : ""}`)}`;
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else window.open(url, "_blank", "noopener");
      setStatus("The PDF is in your downloads. WhatsApp opens with a link to the bill.");
    } catch {
      tab?.close();
      setStatus("Couldn’t make the PDF. Check your connection and try again, or use Print bill.");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    setStatus(`Making the ${what} PDF…`);
    try {
      save(await makeFiles());
      setStatus("");
    } catch {
      setStatus("Couldn’t make the PDF. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // compact (a history row): a short word shows, and the full name is what's read out and matched by voice
  const label = (full: string, short: string) =>
    compact ? (
      <>
        <span className="sr-only">{full}</span>
        <span aria-hidden="true">{short}</span>
      </>
    ) : (
      <span>{full}</span>
    );

  return (
    <div className={compact ? "bill-actions is-compact" : "bill-actions"}>
      <button type="button" className="secondary-button bill-print" onClick={print} title={compact ? `Print ${what}` : undefined}>
        <Printer size={17} aria-hidden="true" />
        {label(estimate ? "Print kaccha bill" : bills.length > 1 ? "Print bills" : "Print bill", "Print")}
      </button>
      <button
        type="button"
        className="bill-share"
        onClick={share}
        disabled={busy}
        aria-busy={busy}
        title={compact ? `Share ${what} PDF on WhatsApp` : undefined}
      >
        <Share2 size={17} aria-hidden="true" />
        {label(estimate ? "Share kaccha bill" : "Share PDF on WhatsApp", "Share PDF")}
      </button>
      {!compact && (
        <button type="button" className="text-button bill-download" onClick={download} disabled={busy}>
          <Download size={15} aria-hidden="true" /> Download PDF
        </button>
      )}
      <span className="bill-actions-status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
