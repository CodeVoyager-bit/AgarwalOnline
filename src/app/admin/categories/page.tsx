import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { CatalogAdminNav } from "@/components/catalog-admin-nav";
import { requirePage } from "@/lib/auth/session";
import { catalogManagementAction } from "@/lib/catalog/manage-actions";
import { Category, Product } from "@/lib/db/models";

export default async function CategoriesPage() {
  await requirePage("catalog:write");
  const categories = await Category.find({}).sort({ "name.en": 1 });
  const counts = await Product.aggregate([{ $group: { _id: "$categoryId", count: { $sum: 1 } } }]);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Catalog"
        title="Categories"
        lead="Keep browsing groups concise and bilingual."
      />
      <CatalogAdminNav />
      <div className="split-workspace">
        <div className="panel">
          <h2>Create category</h2>
          <ActionForm action={catalogManagementAction} submit="Create category">
            <input type="hidden" name="operation" value="category" />
            <label>URL slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
            <label>English name<input name="nameEn" required /></label>
            <label>Marathi name<input name="nameMr" required /></label>
            <label>Short symbol<input name="symbol" maxLength={12} /></label>
            <label>Parent<select name="parentId"><option value="">None</option>{categories.map((item) => <option value={String(item._id)} key={String(item._id)}>{item.name.en}</option>)}</select></label>
          </ActionForm>
        </div>
        <div>
          {categories.map((category) => (
            <article className="panel" key={String(category._id)}>
              <div className="panel-heading"><div><span className="eyebrow">{category.slug}</span><h2>{category.name.en}</h2></div><span className="status-pill">{counts.find((row) => String(row._id) === String(category._id))?.count ?? 0} products</span></div>
              <ActionForm action={catalogManagementAction} submit="Save category">
                <input type="hidden" name="operation" value="category" /><input type="hidden" name="categoryId" value={String(category._id)} />
                <label>URL slug<input name="slug" defaultValue={category.slug} required /></label>
                <label>English name<input name="nameEn" defaultValue={category.name.en} required /></label>
                <label>Marathi name<input name="nameMr" defaultValue={category.name.mr} required /></label>
                <label>Short symbol<input name="symbol" defaultValue={category.symbol} /></label>
                <label>Parent<select name="parentId" defaultValue={String(category.parentId ?? "")}><option value="">None</option>{categories.filter((item) => String(item._id) !== String(category._id)).map((item) => <option value={String(item._id)} key={String(item._id)}>{item.name.en}</option>)}</select></label>
              </ActionForm>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
