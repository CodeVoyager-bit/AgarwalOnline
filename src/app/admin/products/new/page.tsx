import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { CatalogAdminNav } from "@/components/catalog-admin-nav";
import { requirePage } from "@/lib/auth/session";
import { governanceAction } from "@/lib/governance/actions";
import { Category } from "@/lib/db/models";

export default async function NewProductPage() {
  await requirePage("catalog:write");
  const categories = await Category.find({}).sort({ "name.en": 1 });
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Catalog"
        title="Add a product"
        lead="Create the first pack and send the listing through approval."
      />
      <CatalogAdminNav />
      <div className="panel editor-panel">
        <ActionForm action={governanceAction} submit="Submit product for approval">
          <input type="hidden" name="operation" value="product" />
          <div className="settings-grid">
            <label>URL slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
            <label>English name<input name="nameEn" required /></label>
            <label>Marathi name<input name="nameMr" required /></label>
            <label>Brand<input name="brand" /></label>
            <label className="field-wide">English description<textarea name="descriptionEn" required /></label>
            <label className="field-wide">Marathi description<textarea name="descriptionMr" required /></label>
            <label>Category<select name="categoryId" required>{categories.map((item) => <option value={String(item._id)} key={String(item._id)}>{item.name.en}</option>)}</select></label>
            <label>Search aliases<input name="aliases" placeholder="notebook, diary, वही" /></label>
            <label>SKU<input name="sku" pattern="[A-Za-z0-9-]+" required /></label>
            <label>Pack label<input name="label" placeholder="1 kg" required /></label>
            <label>Unit<select name="unit">{["piece", "kg", "g", "l", "ml"].map((unit) => <option key={unit}>{unit}</option>)}</select></label>
            <label>Pack quantity<input name="packQuantity" type="number" min="0.001" step="any" required /></label>
            <label>Selling price (paise)<input name="pricePaise" type="number" min={1} required /></label>
            <label>MRP (paise)<input name="mrpPaise" type="number" min={1} required /></label>
            <label>Opening stock<input name="stock" type="number" min={0} required /></label>
          </div>
        </ActionForm>
      </div>
    </section>
  );
}
