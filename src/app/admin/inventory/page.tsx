import { ActionForm } from "@/components/action-form";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatIst, displayStatus } from "@/lib/display";
import { History } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { CatalogAdminNav } from "@/components/catalog-admin-nav";
import { requirePage } from "@/lib/auth/session";
import { catalogManagementAction } from "@/lib/catalog/manage-actions";
import { governanceAction } from "@/lib/governance/actions";
import { InventoryMovement } from "@/lib/commerce/models";
import { InventoryItem, Product, ProductVariant } from "@/lib/db/models";

export default async function InventoryPage() {
  await requirePage("inventory:adjust");
  const [products, variants, inventory, movements] = await Promise.all([
    Product.find({}).sort({ "name.en": 1 }).limit(200),
    ProductVariant.find({}).sort({ sku: 1 }).limit(500),
    InventoryItem.find({}).limit(500),
    InventoryMovement.find({}).sort({ at: -1 }).limit(50).populate("variantId", "sku label"),
  ]);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Store control"
        title="Inventory"
        lead="Create pack sizes, track reservations and record every adjustment."
      />
      <CatalogAdminNav />
      <details className="panel create-staff">
        <summary>Create a pack size</summary>
        <ActionForm action={catalogManagementAction} submit="Create pack size">
          <input type="hidden" name="operation" value="variant" />
          <div className="staff-form-grid">
            <label>Product<select name="productId">{products.filter((item) => item.status === "published").map((item) => <option value={String(item._id)} key={String(item._id)}>{item.name.en}</option>)}</select></label>
            <label>SKU<input name="sku" required /></label><label>Pack label<input name="label" required /></label>
            <label>Unit<select name="unit">{["piece", "kg", "g", "l", "ml"].map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            <label>Pack quantity<input name="packQuantity" type="number" min="0.001" step="any" required /></label>
            <label>Price (paise)<input name="pricePaise" type="number" min={1} required /></label>
            <label>MRP (paise)<input name="mrpPaise" type="number" min={1} required /></label>
            <label>Purchase limit<input name="maxQuantity" type="number" min={1} defaultValue={10} required /></label>
            <label>Opening stock<input name="stock" type="number" min={0} required /></label>
          </div>
        </ActionForm>
      </details>
      <div className="inventory-grid">
        {variants.map((variant) => {
          const product = products.find((item) => String(item._id) === String(variant.productId));
          const stock = inventory.find((item) => String(item.variantId) === String(variant._id));
          const available = Math.max(0, (stock?.onHand ?? 0) - (stock?.reserved ?? 0));
          return <article className="panel" key={String(variant._id)}><div className="panel-heading"><div><span className="eyebrow">{variant.sku}</span><h2>{product?.name.en}</h2><p>{variant.label}</p></div><span className={`staff-state ${available <= 10 ? "inactive" : "active"}`}>{available} available</span></div><p className="muted">On hand {stock?.onHand ?? 0} · reserved {stock?.reserved ?? 0}</p><details><summary>Adjust inventory</summary><ActionForm action={governanceAction} submit="Record adjustment" confirmMessage="Review the quantity and reason. This changes sellable stock and is written to the audit trail."><input type="hidden" name="operation" value="stock" /><input type="hidden" name="variantId" value={String(variant._id)} /><label>Quantity change<input name="delta" type="number" required /></label><label>Reason<textarea name="reason" minLength={5} maxLength={500} required /></label></ActionForm></details></article>;
        })}
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Traceability</span>
            <h2>Movement history</h2>
          </div>
        </div>
        <DataTable
          bare
          caption="Every recorded stock movement with time, pack, type and quantity"
          rows={movements}
          rowKey={(movement) => String(movement._id)}
          columns={[
            { header: "When", cell: (movement) => formatIst(movement.at) },
            {
              header: "SKU",
              cell: (movement) => {
                const variant = movement.variantId as unknown as {
                  sku?: string;
                  label?: string;
                };
                return `${variant?.sku} · ${variant?.label}`;
              },
            },
            { header: "Type", cell: (movement) => displayStatus(movement.kind) },
            {
              header: "Quantity",
              numeric: true,
              cell: (movement) =>
                `${movement.quantity > 0 ? "+" : ""}${movement.quantity}`,
            },
          ]}
          empty={
            <EmptyState
              icon={History}
              title="No movements recorded yet"
              body="Every stock adjustment, sale and release is logged here."
              heading="h3"
            />
          }
        />
      </div>
    </section>
  );
}
