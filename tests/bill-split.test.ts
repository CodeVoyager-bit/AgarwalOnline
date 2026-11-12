import { describe, expect, it } from "vitest";
import {
  AGARWAL,
  billFileName,
  financialYear,
  orderBillList,
  providerBillNumber,
  shareDiscount,
  withRevision,
} from "../src/lib/commerce/bill-split";
import { billingChecklist, billingInput } from "../src/lib/providers/billing-rules";
import { billKind, renderInvoice, COMPOSITION_LINE } from "../src/lib/documents/invoice";
import { billBar } from "../src/lib/documents/bill-bar";
import { gstinCheckChar } from "../src/lib/tax/gst";

const gstin = (first14: string) => first14 + gstinCheckChar(first14);
const PROVIDER_GSTIN = gstin("27ABCDE1234F1Z");

describe("one order, one bill per seller", () => {
  it("names the financial year in India's time", () => {
    // 31 March 2027, 23:00 in India, is still the year that began in April 2026
    expect(financialYear(new Date("2027-03-31T17:30:00Z"))).toBe("26-27");
    // 1 April 2027, 00:30 in India
    expect(financialYear(new Date("2027-03-31T19:00:00Z"))).toBe("27-28");
    expect(financialYear(new Date("2099-12-01T00:00:00Z"))).toBe("99-00");
  });

  it("numbers a provider's bills in its own series, within the law's 16 characters", () => {
    expect(providerBillNumber("KT", "26-27", 1)).toBe("KT/26-27/0001");
    expect(providerBillNumber("ABC", "26-27", 12345)).toBe("ABC/26-27/12345");
    expect(providerBillNumber("KT", "26-27", 1, 2)).toBe("KT/26-27/0001R2");
    expect(() => providerBillNumber("ABC", "26-27", 12345, 2)).toThrow(/16 characters/);
    expect(withRevision("KT/26-27/0001", 1)).toBe("KT/26-27/0001R1");
    expect(withRevision("KT/26-27/0001R1", 2)).toBe("KT/26-27/0001R2");
    expect(withRevision("KT/26-27/0001R1", 0)).toBe("KT/26-27/0001");
  });

  it("shares a coupon over the bills by value, to the paisa", () => {
    expect(shareDiscount(4000, [10000, 30000])).toEqual([1000, 3000]);
    const odd = shareDiscount(1001, [3333, 3333, 3334]);
    expect(odd.reduce((sum, share) => sum + share, 0)).toBe(1001);
    // never more than the items come to
    expect(shareDiscount(99999, [500, 500])).toEqual([500, 500]);
    expect(shareDiscount(0, [500])).toEqual([0]);
  });

  it("lists Agarwal's bill (with the delivery) and each provider's, numbered once issued", () => {
    const provider = "6a1b2c3d4e5f6a7b8c9d0e1f";
    const order = {
      items: [
        { linePaise: 10000 },
        { linePaise: 30000, billedBy: provider },
      ],
      deliveryPaise: 3000,
      promotionDiscountPaise: 4000,
      providerBills: [{ providerId: provider, number: "KT/26-27/0001", issuedAt: new Date(), seller: { legalName: "Kale Toys and Games" } }],
      bill: { revision: 1 },
    };
    expect(orderBillList(order)).toEqual([
      expect.objectContaining({ key: AGARWAL, itemsPaise: 10000, discountPaise: 1000, deliveryPaise: 3000, totalPaise: 12000, issued: true }),
      expect.objectContaining({
        key: provider,
        number: "KT/26-27/0001R1",
        sellerName: "Kale Toys and Games",
        itemsPaise: 30000,
        discountPaise: 3000,
        deliveryPaise: 0,
        totalPaise: 27000,
        issued: true,
      }),
    ]);
    // before delivery a provider's bill isn't issued yet; with only its items and no fee, Agarwal has no bill
    const only = orderBillList({ items: [{ linePaise: 500, billedBy: provider }], deliveryPaise: 0 });
    expect(only).toEqual([expect.objectContaining({ key: provider, issued: false, number: null })]);
    // an ordinary order: one bill, Agarwal's, the whole total
    expect(orderBillList({ items: [{ linePaise: 500 }], deliveryPaise: 3000 })).toEqual([
      expect.objectContaining({ key: AGARWAL, totalPaise: 3500 }),
    ]);
  });

  it("names the PDF after the seller and the bill", () => {
    expect(billFileName("Agarwal General Stores", "20261107-00012")).toBe("Agarwal-General-Stores-bill-20261107-00012.pdf");
    expect(billFileName("Kale Toys & Games", "KT/26-27/0001")).toBe("Kale-Toys-Games-bill-KT-26-27-0001.pdf");
  });
});

describe("a provider's own bills", () => {
  const shop = { stateCode: "27", caConfirmed: true, providerLive: true };
  const ready = { registration: "regular", gstin: PROVIDER_GSTIN, legalName: "Kale Toys and Games", address: "Station Road, Pali", prefix: "KT", agreement: true };
  const missing = (billing: Parameters<typeof billingChecklist>[0], over = {}) =>
    billingChecklist(billing, { ...shop, ...over })
      .filter((item) => !item.done)
      .map((item) => item.key);

  it("unlocks only with GST registration, a local GSTIN, the details, the agreement and the CA's word", () => {
    expect(missing(ready)).toEqual([]);
    expect(missing({ ...ready, registration: "unregistered" })).toEqual(["registered"]);
    expect(missing({ ...ready, gstin: gstin("29ABCDE1234F1Z") })).toEqual(["gstin"]);
    expect(missing({ ...ready, prefix: undefined })).toEqual(["details"]);
    expect(missing({ ...ready, agreement: false })).toEqual(["agreement"]);
    expect(missing(ready, { caConfirmed: false })).toEqual(["ca"]);
    expect(missing(ready, { providerLive: false })).toEqual(["live"]);
  });

  it("reads the form: a registered provider needs its GSTIN, and the prefix is 1 to 3 letters", () => {
    expect(() => billingInput.parse({ registration: "regular" })).toThrow(/needs its GSTIN/);
    expect(billingInput.parse({ registration: "regular", gstin: PROVIDER_GSTIN.toLowerCase(), prefix: "kt", ownBills: "true", agreement: "on" })).toMatchObject({
      gstin: PROVIDER_GSTIN,
      prefix: "KT",
      ownBills: true,
      agreement: true,
      style: "same",
    });
    expect(() => billingInput.parse({ registration: "unregistered", prefix: "KTOY" })).toThrow(/1 to 3 capital letters/);
  });

  it("gives a provider under the composition scheme a bill of supply, with the line the law asks for", () => {
    expect(billKind({ estimate: false, sellerGstin: PROVIDER_GSTIN, rates: [18], composition: true })).toBe("bill-of-supply");
    const html = renderInvoice({
      order: {
        number: "AGS-20261107-00012",
        createdAt: new Date(),
        items: [{ name: "Toy car", label: "1 piece", quantity: 1, pricePaise: 24900, linePaise: 24900 }],
        address: { name: "Asha Patil", line: "Market Road", areaName: "Nagothane", pin: "402106" },
        paymentMethod: "cod",
        paymentStatus: "paid",
        orderStatus: "completed",
        subtotalPaise: 24900,
        deliveryPaise: 0,
        totalPaise: 24900,
      },
      seller: { legalName: "Kale Toys and Games", gstin: PROVIDER_GSTIN },
      stateName: "Maharashtra (27)",
      number: "KT/26-27/0001",
      date: new Date(),
      bill: {
        showLogo: false,
        showCustomerPhone: false,
        showPayment: true,
        showMrp: false,
        amountInWords: true,
        thankYou: "",
        terms: "",
        footerNote: "",
        showSignature: true,
        signatureLabel: "Authorised signatory",
        showBankDetails: false,
        style: "modern",
        shopNameMr: "",
        greeting: "",
        paper: "a4",
        accent: "#1e3a8a",
        openAs: "page",
      },
      facts: new Map(),
      origin: "http://127.0.0.1:3000",
      composition: true,
      extraNotes: ["Sold through Agarwal Online (Agarwal General Stores), which delivered it and collected the payment, order AGS-20261107-00012."],
    });
    expect(html).toContain("Bill of supply");
    expect(html).toContain(COMPOSITION_LINE);
    expect(html).toContain("Sold through Agarwal Online");
    expect(html).toContain("For Kale Toys and Games");
    // no buttons unless asked for: a PDF is drawn from this
    expect(html).not.toContain("Share PDF on WhatsApp");
  });

  it("puts Print bill and Share PDF on WhatsApp on a bill page, never on paper", () => {
    const bar = billBar({ share: { pdfUrl: "/api/invoices/abc/pdf", fileName: "Bill.pdf", text: "Bill </script> for order", linkUrl: "/api/invoices/abc/link" } });
    expect(bar).toContain("Print bill");
    expect(bar).toContain("Share PDF on WhatsApp");
    expect(bar).toContain("Download PDF");
    expect(bar).toContain("@media print{.bill-bar{display:none}}");
    // a name can't close the script
    expect(bar).not.toContain("Bill </script>");
    // Download is a button: it saves the PDF without leaving the bill, and says why when it can't
    expect(bar).toContain('<button type="button" class="bb-download" id="bb-download">Download PDF</button>');
    expect(bar).not.toMatch(/<a [^>]*download/);
    // Back is there for a bill opened in place, hidden until the script sees it was
    expect(bar).toContain('id="bb-back" hidden');
    // a sample bill: Print only, no share button and no script
    expect(billBar({})).toContain("Print bill");
    expect(billBar({})).not.toContain('id="bb-share"');
    expect(billBar({})).not.toContain("<script>");
    expect(billBar(null)).toBe("");
  });
});
