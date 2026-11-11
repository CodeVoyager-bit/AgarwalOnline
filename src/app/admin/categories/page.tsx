import Link from "next/link";
import mongoose from "mongoose";
import { FolderTree } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { CatalogAdminNav } from "@/components/catalog-admin-nav";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { requirePage } from "@/lib/auth/session";
import { catalogManagementAction } from "@/lib/catalog/manage-actions";
import { Category, Product, parentsOf } from "@/lib/db/models";
import { notDeleted } from "@/lib/catalog/deleted";
export const metadata = { title: "Categories", robots: { index: false } };

type CategoryDoc = {
  _id: unknown;
  slug: string;
  name: { en: string; mr: string };
  symbol?: string | null;
  parentIds?: unknown[] | null;
  parentId?: unknown;
};

/**
 * The same fields for adding and editing, so the two forms can never drift apart. `sections` are
 * the categories this one can show under; `holds` is how many sit inside it (a section).
 */
function CategoryFields({ category, sections, holds = 0 }: { category?: CategoryDoc; sections: CategoryDoc[]; holds?: number }) {
  const inside = category ? parentsOf(category) : [];
  return (
    <div className="staff-form-grid">
      <label>
        English name
        <input name="nameEn" defaultValue={category?.name.en} required />
      </label>
      <label>
        Marathi name
        <input name="nameMr" defaultValue={category?.name.mr} lang="mr" required />
      </label>
      <label>
        Web address <small>Lowercase words joined by dashes, like gift-wrap</small>
        <input
          name="slug"
          defaultValue={category?.slug}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          spellCheck={false}
          required
        />
      </label>
      <label>
        Short symbol <small>Optional, one character</small>
        <input name="symbol" defaultValue={category?.symbol ?? ""} maxLength={12} />
      </label>
      {holds > 0 ? (
        <p className="muted tick-note">
          A section: {holds} {holds === 1 ? "category sits" : "categories sit"} inside it, so it can’t go inside another.
        </p>
      ) : (
        <fieldset className="tick-list">
          <legend>
            Shows under <small>Tick every section shoppers would look in. Pens can sit under Stationery and under Office.</small>
          </legend>
          {sections.length ? (
            <div className="tick-grid">
              {sections.map((item) => (
                <label className="checkbox-label" key={String(item._id)}>
                  <input type="checkbox" name="parentIds" value={String(item._id)} defaultChecked={inside.includes(String(item._id))} />
                  {item.name.en}
                </label>
              ))}
            </div>
          ) : (
            <p className="muted">No sections yet. Add a category such as “Stationery” first, with no products in it, then tick it here.</p>
          )}
        </fieldset>
      )}
    </div>
  );
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; q?: string }>;
}) {
  await requirePage("catalog:write");
  const { edit, q = "" } = await searchParams;
  const term = q.trim().toLowerCase().slice(0, 80);
  const [categories, counts, extra] = await Promise.all([
    Category.find({}).sort({ "name.en": 1 }),
    Product.aggregate<{ _id: unknown; count: number }>([{ $match: notDeleted }, { $group: { _id: "$categoryId", count: { $sum: 1 } } }]),
    // products that also show here, on top of the category's own
    Product.aggregate<{ _id: string; count: number }>([
      { $match: notDeleted },
      { $unwind: "$alsoOn" },
      { $group: { _id: "$alsoOn", count: { $sum: 1 } } },
    ]),
  ]);
  const ownCount = (id: unknown) => counts.find((row) => String(row._id) === String(id))?.count ?? 0;
  const countFor = (category: CategoryDoc) => ownCount(category._id) + (extra.find((row) => row._id === category.slug)?.count ?? 0);
  const held = (id: unknown) => categories.filter((item) => parentsOf(item).includes(String(id)));
  // what a category can show under: top-level ones with no products of their own (a section lists only its shelves)
  const sectionsFor = (category?: CategoryDoc) =>
    categories.filter(
      (item) => String(item._id) !== String(category?._id) && !parentsOf(item).length && (held(item._id).length > 0 || !ownCount(item._id)),
    );
  const editing = edit && mongoose.isValidObjectId(edit) ? categories.find((item) => String(item._id) === edit) : undefined;
  const shown = term
    ? categories.filter((item) => [item.name.en, item.name.mr, item.slug].some((text) => text.toLowerCase().includes(term)))
    : categories;
  const nested = categories.some((item) => parentsOf(item).length);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Categories"
        lead="The categories shoppers browse. A category can show under more than one section, such as Pens under Stationery and Office."
      />
      <CatalogAdminNav />
      {editing && (
        <div className="panel adjust-panel" id="edit">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Edit category</span>
              <h2>{editing.name.en}</h2>
            </div>
            <Link href="/admin/categories" className="text-button">
              Close
            </Link>
          </div>
          <ActionForm action={catalogManagementAction} submit="Save category">
            <input type="hidden" name="operation" value="category" />
            <input type="hidden" name="categoryId" value={String(editing._id)} />
            <CategoryFields category={editing} sections={sectionsFor(editing)} holds={held(editing._id).length} />
          </ActionForm>
        </div>
      )}
      <details className="panel create-staff">
        <summary>Add a category</summary>
        <ActionForm action={catalogManagementAction} submit="Add category">
          <input type="hidden" name="operation" value="category" />
          <CategoryFields sections={sectionsFor()} />
        </ActionForm>
      </details>
      <FilterBar label="Find categories" submitLabel="Find" clearHref={term ? "/admin/categories" : undefined}>
        <label>
          Name or web address
          <input name="q" defaultValue={q} maxLength={80} placeholder="Pens or पेन" />
        </label>
      </FilterBar>
      <p className="results-line" role="status">
        <span>
          <strong>{shown.length}</strong> {shown.length === 1 ? "category" : "categories"}
          {term ? ` matching “${q.trim()}”` : ", A to Z"}
        </span>
      </p>
      <DataTable
        caption="Categories with their Marathi name, web address and number of products"
        exportName="Categories"
        rows={shown}
        rowKey={(category) => String(category._id)}
        columns={[
          {
            header: "Category",
            text: (category) => category.name.en,
            cell: (category) => (
              <>
                <Link href={`/admin/categories?edit=${category._id}#edit`}>{category.name.en}</Link>
                <small>
                  <span lang="mr">{category.name.mr}</span> · /catalog?category={category.slug}
                </small>
              </>
            ),
          },
          ...(nested
            ? [
                {
                  header: "Shows under",
                  cell: (category: (typeof categories)[number]) => {
                    const shelves = held(category._id).length;
                    if (shelves) return <small>Section · {shelves} inside</small>;
                    const inside = parentsOf(category);
                    return categories.filter((item) => inside.includes(String(item._id))).map((item) => item.name.en).join(", ") || "—";
                  },
                },
              ]
            : []),
          { header: "Products", numeric: true, cell: (category) => countFor(category) },
        ]}
        empty={
          <EmptyState icon={FolderTree} title="No categories yet" body="Add the first category above so products have somewhere to live." heading="h3" />
        }
      />
    </section>
  );
}
