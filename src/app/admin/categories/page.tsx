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
import { SHOP_PLAN, groupShelves } from "@/lib/catalog/sections";
export const metadata = { title: "Categories", robots: { index: false } };

type CategoryDoc = {
  _id: unknown;
  slug: string;
  name: { en: string; mr: string };
  parentIds?: unknown[] | null;
  parentId?: unknown;
};

/**
 * The same fields for adding and editing, so the two forms can never drift apart. A category is
 * a big group (Stationery); a subcategory sits inside one or more of them and holds the products.
 */
function CategoryFields({ kind, category, choices }: { kind: "category" | "subcategory"; category?: CategoryDoc; choices: CategoryDoc[] }) {
  const inside = category ? parentsOf(category) : [];
  return (
    <div className="staff-form-grid">
      <label>
        English name
        <input name="nameEn" defaultValue={category?.name.en} placeholder={kind === "category" ? "Stationery" : "Pens"} required />
      </label>
      <label>
        Marathi name
        <input name="nameMr" defaultValue={category?.name.mr} lang="mr" placeholder={kind === "category" ? "स्टेशनरी" : "पेन"} required />
      </label>
      <label>
        Web address <small>Lowercase words joined by dashes, like gift-wrap</small>
        <input name="slug" defaultValue={category?.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" spellCheck={false} required />
      </label>
      {kind === "subcategory" && (
        <fieldset className="tick-list">
          <legend>
            Inside <small>Tick every category shoppers would look in. Pens can sit in Stationery and in Office.</small>
          </legend>
          {choices.length ? (
            <div className="tick-grid">
              {choices.map((item) => (
                <label className="checkbox-label" key={String(item._id)}>
                  <input type="checkbox" name="parentIds" value={String(item._id)} defaultChecked={inside.includes(String(item._id))} />
                  {item.name.en}
                </label>
              ))}
            </div>
          ) : (
            <p className="muted">There are no categories yet. Add a category first, then put this inside it.</p>
          )}
        </fieldset>
      )}
    </div>
  );
}

const SHOWS = [
  { value: "", label: "Categories and subcategories" },
  { value: "categories", label: "Categories only" },
  { value: "subcategories", label: "Subcategories only" },
  { value: "loose", label: "Not in a category yet" },
];

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; q?: string; show?: string }>;
}) {
  await requirePage("catalog:write");
  const { edit, q = "", show = "" } = await searchParams;
  const term = q.trim().toLowerCase().slice(0, 80);
  const [all, counts, extra, plan] = await Promise.all([
    Category.find({}).sort({ "name.en": 1 }),
    Product.aggregate<{ _id: unknown; count: number }>([{ $match: notDeleted }, { $group: { _id: "$categoryId", count: { $sum: 1 } } }]),
    // products that also show in a subcategory, on top of its own
    Product.aggregate<{ _id: string; count: number }>([
      { $match: notDeleted },
      { $unwind: "$alsoOn" },
      { $group: { _id: "$alsoOn", count: { $sum: 1 } } },
    ]),
    // what "Sort them for me" would do, without doing it
    groupShelves(false),
  ]);
  const ownCount = (id: unknown) => counts.find((row) => String(row._id) === String(id))?.count ?? 0;
  const productsIn = (item: CategoryDoc) => ownCount(item._id) + (extra.find((row) => row._id === item.slug)?.count ?? 0);
  const inside = (id: unknown) => all.filter((item) => parentsOf(item).includes(String(id)));
  // a category holds subcategories, or is a new top-level one with nothing in it yet; everything else is a subcategory
  const isCategory = (item: CategoryDoc) => inside(item._id).length > 0 || (!parentsOf(item).length && !ownCount(item._id));
  const categories = all.filter(isCategory);
  const subcategories = all.filter((item) => !isCategory(item));
  const parentsFor = (item: CategoryDoc) => categories.filter((category) => parentsOf(item).includes(String(category._id)));
  const loose = subcategories.filter((item) => !parentsFor(item).length);
  // each category, then the subcategories whose first category it is; the ones in no category come last
  const ordered = [
    ...categories.flatMap((category) => [category, ...subcategories.filter((item) => String(parentsFor(item)[0]?._id) === String(category._id))]),
    ...loose,
  ];
  const shown = ordered.filter(
    (item) =>
      (!term || [item.name.en, item.name.mr, item.slug].some((text) => text.toLowerCase().includes(term))) &&
      (show === "categories" ? isCategory(item) : show === "subcategories" ? !isCategory(item) : show === "loose" ? loose.includes(item) : true),
  );
  const editing = edit && mongoose.isValidObjectId(edit) ? all.find((item) => String(item._id) === edit) : undefined;
  const editingKind = editing && isCategory(editing) ? "category" : "subcategory";
  const planned = SHOP_PLAN.filter((section) => plan.done.some((line) => line.endsWith(`→ ${section.en}`))).map((section) => section.en);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Categories"
        lead="A category is a big group shoppers see first, such as Stationery. Subcategories sit inside it, such as Pens, and hold the products. One subcategory can sit in two categories."
      />
      <CatalogAdminNav />
      {editing && (
        <div className="panel adjust-panel" id="edit">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{editingKind === "category" ? "Edit category" : "Edit subcategory"}</span>
              <h2>{editing.name.en}</h2>
            </div>
            <Link href="/admin/categories" className="text-button">
              Close
            </Link>
          </div>
          <ActionForm action={catalogManagementAction} submit={editingKind === "category" ? "Save category" : "Save subcategory"}>
            <input type="hidden" name="operation" value="category" />
            <input type="hidden" name="categoryId" value={String(editing._id)} />
            <CategoryFields kind={editingKind} category={editing} choices={categories.filter((item) => String(item._id) !== String(editing._id))} />
            {editingKind === "category" && (
              <p className="muted">
                {inside(editing._id).length
                  ? `Inside it: ${inside(editing._id).map((item) => item.name.en).join(", ")}. Open a subcategory to move it.`
                  : "Nothing is inside it yet. Add a subcategory and tick this category."}
              </p>
            )}
          </ActionForm>
        </div>
      )}
      {/* offered once, while nothing is sorted: after that the owners arrange things by hand and aren't asked again */}
      {plan.moves > 0 && categories.every((category) => !inside(category._id).length) && (
        <div className="panel sort-offer" id="sort">
          <div>
            <h2>Sort them for me</h2>
            <p className="muted">
              Your subcategories aren’t sorted into categories yet. This puts them into {planned.join(", ")}. Pens, registers and diaries go in two. You
              can change anything afterwards.
            </p>
          </div>
          <ActionForm
            action={catalogManagementAction}
            submit="Sort into categories"
            confirmMessage="Shoppers will see the shop grouped into these categories straight away. You can move any subcategory afterwards."
          >
            <input type="hidden" name="operation" value="sort" />
          </ActionForm>
        </div>
      )}
      <details className="panel create-staff">
        <summary>Add a category</summary>
        <p className="muted">A big group, such as Stationery. Add it first, then put subcategories inside it.</p>
        <ActionForm action={catalogManagementAction} submit="Add category">
          <input type="hidden" name="operation" value="category" />
          <CategoryFields kind="category" choices={[]} />
        </ActionForm>
      </details>
      <details className="panel create-staff">
        <summary>Add a subcategory</summary>
        <p className="muted">Where products go, such as Pens. Tick the category or categories it sits in.</p>
        <ActionForm action={catalogManagementAction} submit="Add subcategory">
          <input type="hidden" name="operation" value="category" />
          <input type="hidden" name="kind" value="subcategory" />
          <CategoryFields kind="subcategory" choices={categories} />
        </ActionForm>
      </details>
      <FilterBar label="Find categories" submitLabel="Find" clearHref={term || show ? "/admin/categories" : undefined}>
        <label>
          Name or web address
          <input name="q" defaultValue={q} maxLength={80} placeholder="Pens or पेन" />
        </label>
        <label>
          Show
          <select name="show" defaultValue={SHOWS.some((option) => option.value === show) ? show : ""}>
            {SHOWS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>
      <p className="results-line" role="status">
        <span>
          <strong>{categories.length}</strong> {categories.length === 1 ? "category" : "categories"} · <strong>{subcategories.length}</strong>{" "}
          {subcategories.length === 1 ? "subcategory" : "subcategories"}
          {loose.length ? ` · ${loose.length} not in a category yet` : ""}
          {term || show ? ` · showing ${shown.length}` : ""}
        </span>
      </p>
      <DataTable
        caption="Categories with the subcategories inside each, and the number of products"
        exportName="Categories"
        rows={shown}
        rowKey={(item) => String(item._id)}
        columns={[
          {
            header: "Name",
            text: (item) => item.name.en,
            cell: (item) =>
              isCategory(item) ? (
                <>
                  <Link href={`/admin/categories?edit=${item._id}#edit`}>
                    <strong>{item.name.en}</strong>
                  </Link>
                  <small>
                    <span lang="mr">{item.name.mr}</span> · category
                  </small>
                </>
              ) : (
                <span className="subcat">
                  <Link href={`/admin/categories?edit=${item._id}#edit`}>{item.name.en}</Link>
                  <small>
                    <span lang="mr">{item.name.mr}</span> · /catalog?category={item.slug}
                  </small>
                </span>
              ),
          },
          {
            header: "Inside",
            text: (item) => (isCategory(item) ? "" : parentsFor(item).map((category) => category.name.en).join(", ")),
            cell: (item) =>
              isCategory(item) ? (
                <small>
                  {inside(item._id).length} {inside(item._id).length === 1 ? "subcategory" : "subcategories"}
                </small>
              ) : (
                parentsFor(item).map((category) => category.name.en).join(", ") || <small>Not in a category yet</small>
              ),
          },
          {
            header: "Products",
            numeric: true,
            cell: (item) => (isCategory(item) ? inside(item._id).reduce((sum, sub) => sum + productsIn(sub), 0) : productsIn(item)),
          },
        ]}
        empty={
          <EmptyState icon={FolderTree} title="Nothing here" body="Add a category above, then a subcategory inside it, so products have somewhere to live." heading="h3" />
        }
      />
    </section>
  );
}
