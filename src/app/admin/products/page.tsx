import { requirePage } from "@/lib/auth/session";
import {
  Category,
  Product,
  ProductVariant,
  InventoryItem,
} from "@/lib/db/models";
import { ActionForm } from "@/components/action-form";
import { governanceAction } from "@/lib/governance/actions";
import { catalogManagementAction } from "@/lib/catalog/manage-actions";
import { evidenceAction } from "@/lib/evidence/actions";
import { CatalogAdminNav } from "@/components/catalog-admin-nav";
import { PageHeading } from "@/components/page-heading";
import { EmptyState } from "@/components/empty-state";
import { Boxes, PackageOpen } from "lucide-react";
export default async function Products() {
  await requirePage("catalog:write");
  const categories = await Category.find({});
  const products = await Product.find({}).limit(100);
  const variants = await ProductVariant.find({
    productId: { $in: products.map((p) => p._id) },
  });
  const stock = await InventoryItem.find({
    variantId: { $in: variants.map((v) => v._id) },
  });
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Catalog & inventory"
        title="Your shelves"
        lead="Edit live products and request price changes. Categories, new products and stock live on their own tabs."
      />
      <CatalogAdminNav />
      <div className="section-heading">
        <div>
          <span className="eyebrow">Live catalog</span>
          <h2>Products</h2>
        </div>
      </div>
      {products.length ? (
      <div className="settings-grid">
        {products.map((product) => (
          <details
            className="panel product-admin-card"
            key={String(product._id)}
          >
            <summary>
              <span>
                <strong>{product.name.en}</strong>
                <small>
                  {product.status} · {product.categorySlug}
                </small>
              </span>
              <span>Edit</span>
            </summary>
            <ActionForm
              action={catalogManagementAction}
              submit="Save product details"
            >
              <input type="hidden" name="operation" value="product" />
              <input
                type="hidden"
                name="productId"
                value={String(product._id)}
              />
              <label>
                English name
                <input name="nameEn" defaultValue={product.name.en} required />
              </label>
              <label>
                Marathi name
                <input name="nameMr" defaultValue={product.name.mr} required />
              </label>
              <label>
                English description
                <textarea
                  name="descriptionEn"
                  defaultValue={product.description.en}
                  required
                />
              </label>
              <label>
                Marathi description
                <textarea
                  name="descriptionMr"
                  defaultValue={product.description.mr}
                  required
                />
              </label>
              <label>
                Brand
                <input name="brand" defaultValue={product.brand} />
              </label>
              <label>
                Category
                <select
                  name="categoryId"
                  defaultValue={String(product.categoryId)}
                >
                  {categories.map((category) => (
                    <option
                      value={String(category._id)}
                      key={String(category._id)}
                    >
                      {category.name.en}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Aliases
                <input
                  name="aliases"
                  defaultValue={product.aliases.join(", ")}
                />
              </label>
              <label>
                Gallery image URLs <small>One per line, up to 8</small>
                <textarea name="images" defaultValue={(product.images ?? []).join("\n")} />
              </label>
              <label>
                English highlights <small>One per line</small>
                <textarea name="highlightsEn" defaultValue={(product.highlights ?? []).map((item: { en: string }) => item.en).join("\n")} />
              </label>
              <label>
                Marathi highlights <small>One per line</small>
                <textarea name="highlightsMr" defaultValue={(product.highlights ?? []).map((item: { mr: string }) => item.mr).join("\n")} />
              </label>
              <label>
                Dietary tags <small>Comma separated</small>
                <input name="dietaryTags" defaultValue={(product.dietaryTags ?? []).join(", ")} />
              </label>
              <label>
                Specifications <small>Label EN | Label MR | Value EN | Value MR</small>
                <textarea name="specifications" defaultValue={(product.specifications ?? []).map((item: { label: { en: string; mr: string }; value: { en: string; mr: string } }) => `${item.label.en} | ${item.label.mr} | ${item.value.en} | ${item.value.mr}`).join("\n")} />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="featured"
                  defaultChecked={product.featured}
                />{" "}
                Featured
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="bestseller"
                  defaultChecked={product.bestseller}
                />{" "}
                Bestseller
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="published"
                  defaultChecked={product.status === "published"}
                  disabled={product.status !== "published"}
                />{" "}
                Published
              </label>
            </ActionForm>
            <ActionForm action={evidenceAction} submit="Upload product photo">
              <input type="hidden" name="purpose" value="product" />
              <input
                type="hidden"
                name="productId"
                value={String(product._id)}
              />
              <label>
                JPG, PNG or WebP · maximum 5 MB
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                />
              </label>
            </ActionForm>
          </details>
        ))}
      </div>
      ) : (
        <EmptyState icon={PackageOpen} title="No products yet" body="Add your first product from the Add product tab." heading="h3" />
      )}
      <div className="section-heading">
        <div>
          <span className="eyebrow">Pack sizes</span>
          <h2>Pricing per pack</h2>
        </div>
      </div>
      {variants.length ? (
      <div className="settings-grid">
        {variants.map((v) => {
          const p = products.find((p) => String(p._id) === String(v.productId));
          const inventory = stock.find(
            (s) => String(s.variantId) === String(v._id),
          );
          return (
            <article className="panel" key={String(v._id)}>
              <h2>{p?.name.en}</h2>
              <p className="muted">
                {v.sku} · {v.label} · {p?.status}
              </p>
              <p>
                Stock: {inventory?.onHand ?? 0} · Reserved:{" "}
                {inventory?.reserved ?? 0}
              </p>
              <details>
                <summary>Request price change</summary>
                <ActionForm action={governanceAction} submit="Request approval">
                  <input type="hidden" name="operation" value="price" />
                  <input type="hidden" name="variantId" value={String(v._id)} />
                  <label>
                    Price (paise)
                    <input
                      type="number"
                      name="pricePaise"
                      min={1}
                      defaultValue={v.pricePaise}
                      required
                    />
                  </label>
                  <label>
                    MRP (paise)
                    <input
                      type="number"
                      name="mrpPaise"
                      min={1}
                      defaultValue={v.mrpPaise}
                      required
                    />
                  </label>
                </ActionForm>
              </details>
            </article>
          );
        })}
      </div>
      ) : (
        <EmptyState icon={Boxes} title="No pack sizes yet" body="Create one from the Inventory tab to start selling a product." heading="h3" />
      )}
    </section>
  );
}
