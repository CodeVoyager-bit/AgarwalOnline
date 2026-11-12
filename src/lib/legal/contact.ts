import type { LegalBuilder, LegalFacts } from "./types";

const PENDING = "Being added";

/** A phone or email as a tap-to-call or tap-to-write link; the pending note when the owner hasn't saved one. */
function phone(f: LegalFacts) {
  return f.business.phone ? `[${f.business.phone}](tel:+91${f.business.phone})` : PENDING;
}
function email(f: LegalFacts) {
  return f.business.email ? `[${f.business.email}](mailto:${f.business.email})` : PENDING;
}

/* Contact & Grievance: who runs the shop and how complaints are handled, from Store settings. */
export const contactDoc: LegalBuilder = {
  en: (f) => ({
    title: "Contact & Grievance",
    lead: `How to reach ${f.business.legalName}, and how we handle complaints.`,
    sections: [
      {
        id: "store",
        title: "The store",
        blocks: [
          {
            rows: [
              ["Business name", f.business.legalName],
              ["Address", f.business.address],
              ["Phone", phone(f)],
              ["Email", email(f)],
              ...(f.business.gstin ? [["GSTIN", f.business.gstin] as [string, string]] : []),
            ],
          },
        ],
      },
      {
        id: "help",
        title: "Quickest help",
        blocks: [
          {
            list: [
              "Questions about an order: [Talk to the store](/account/support) (sign in first).",
              "Missing, damaged or wrong items, and returns: [Complaints & returns](/account/complaints).",
            ],
          },
        ],
      },
      {
        id: "grievance",
        title: "Grievance officer",
        blocks: [
          "For complaints about the shop, an order or your personal data, as the Consumer Protection (E-Commerce) Rules, 2020, the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023 require:",
          {
            rows: [
              ["Name", f.business.grievanceName ?? PENDING],
              ["Designation", f.business.grievanceDesignation ?? PENDING],
              ["Phone", phone(f)],
              ["Email", email(f)],
              ["Address", f.business.address],
            ],
          },
        ],
      },
      {
        id: "timeline",
        title: "What happens next",
        blocks: [
          "Tell us your order number and what went wrong. We acknowledge every complaint within 48 hours and aim to resolve it within one month, and we tell you what we decided and why.",
        ],
      },
      {
        id: "outside",
        title: "If you're not satisfied",
        blocks: [
          {
            list: [
              "National Consumer Helpline: call 1915, or visit [consumerhelpline.gov.in](https://consumerhelpline.gov.in).",
              "File a consumer complaint online on [e‑Daakhil](https://edaakhil.nic.in).",
              "For complaints about your personal data, after contacting us: the Data Protection Board of India.",
            ],
          },
          "Our [Terms & Conditions](/p/terms-and-conditions#disputes) explain how disputes are decided.",
        ],
      },
    ],
  }),
};
