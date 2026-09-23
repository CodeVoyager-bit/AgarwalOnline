const labels: Record<string, string> = {
  slug: "Web address",
  nameEn: "English name",
  nameMr: "Marathi name",
  descriptionEn: "English description",
  descriptionMr: "Marathi description",
  brand: "Brand",
  categoryId: "Category",
  aliases: "Search terms",
  sku: "SKU",
  label: "Pack",
  unit: "Unit",
  packQuantity: "Pack quantity",
  pricePaise: "Selling price",
  mrpPaise: "MRP",
  stock: "Opening stock",
  onHand: "Stock on hand",
  delta: "Stock adjustment",
};
export function ApprovalDetails({
  values,
  categoryName,
}: {
  values?: Record<string, unknown>;
  categoryName?: string;
}) {
  if (!values)
    return <p className="muted">New product — nothing is live yet.</p>;
  return (
    <dl className="approval-details">
      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <dt>{labels[key] ?? key}</dt>
          <dd>
            {key === "categoryId" && categoryName
              ? categoryName
              : key.endsWith("Paise") && typeof value === "number"
                ? new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                  }).format(value / 100)
                : String(value || "—")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
