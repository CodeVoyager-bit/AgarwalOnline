"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

export function CatalogFilterPanel({
  locale,
  params,
}: {
  locale: "en" | "mr";
  params: Record<string, string | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = [params.inStock, params.sort && params.sort !== "featured"].filter(Boolean).length;
  // every control applies itself; there is no button to find
  const submit = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();

  return (
    <>
      <div className="filter-toggle-row">
        <button
          type="button"
          className="secondary-button filter-toggle"
          aria-expanded={open}
          aria-controls="catalog-filter-form"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={18} /> : <SlidersHorizontal size={18} />}
          {locale === "mr" ? "फिल्टर आणि क्रमवारी" : "Filter & sort"}
          {activeCount > 0 && <span>{activeCount}</span>}
        </button>
      </div>
      <form
        id="catalog-filter-form"
        className={`catalog-filters${open ? " is-open" : ""}`}
        action="/catalog"
      >
        <input type="hidden" name="lang" value={locale} />
        <label>
          {locale === "mr" ? "शोधा" : "Search"}
          <input
            type="search"
            name="q"
            defaultValue={params.q}
            maxLength={100}
            placeholder={locale === "mr" ? "वही, पेन, फाईल…" : "Notebook, pen, file…"}
          />
        </label>
        {params.category && <input type="hidden" name="category" value={params.category} />}
        <label>
          {locale === "mr" ? "क्रमवारी" : "Sort by"}
          <select name="sort" defaultValue={params.sort ?? "featured"} onChange={submit}>
            <option value="featured">{locale === "mr" ? "लोकप्रिय" : "Featured"}</option>
            <option value="price-asc">{locale === "mr" ? "किंमत: कमी ते जास्त" : "Price: low to high"}</option>
            <option value="price-desc">{locale === "mr" ? "किंमत: जास्त ते कमी" : "Price: high to low"}</option>
            <option value="discount">{locale === "mr" ? "सर्वात मोठी बचत" : "Biggest savings"}</option>
            <option value="new">{locale === "mr" ? "नव्याने जोडलेले" : "Recently added"}</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" name="inStock" value="true" defaultChecked={params.inStock === "true"} onChange={submit} />
          {locale === "mr" ? "फक्त उपलब्ध" : "In stock only"}
        </label>
      </form>
    </>
  );
}
