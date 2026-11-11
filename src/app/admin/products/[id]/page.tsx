import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, Plus } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { Category, InventoryItem, Product, ProductVariant, parentsOf } from "@/lib/db/models";
import { objectId } from "@/lib/commerce/service";
import { productImages } from "@/lib/catalog/images";
import { formatPrice } from "@/lib/display";
import { catalogManagementAction } from "@/lib/catalog/manage-actions";
import { governanceAction } from "@/lib/governance/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeading } from "@/components/page-heading";
import { RecordHistory } from "@/components/record-history";
import { StatusPill } from "@/components/status-pill";
import { ProductPhotos } from "@/components/product-photos";
import { orderedPhotos } from "@/lib/catalog/photos";
import { ApprovalRequest } from "@/lib/governance/models";
import { hasPermission } from "@/lib/auth/permissions";
import { isShopperVisible } from "@/lib/catalog/visibility";
import { GST_RATES } from "@/lib/tax/gst";
import { ProviderPicker, type ProviderOption } from "@/components/provider-picker";
import { Provider } from "@/lib/providers/models";
import { PackCard } from "@/components/pack-card";
import { DeleteRow } from "@/components/delete-row";
import { StockChangeDialog } from "@/components/stock-change-dialog";
import { notDeleted } from "@/lib/catalog/deleted";
export const metadata = { title: "Edit product", robots: { index: false } };

const STATUS_NAMES: Record<string, string> = {
  published: "Live in the shop",
  pending: "Waiting for approval",
  approved: "Approved, not live",
  draft: "Draft",
  rejected: "Rejected",
};

export default async function EditProduct({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pack?: string; mode?: string }>;
}) {
  const user = await requirePage("catalog:write");
  // only an owner prices for schools
  const isOwner = hasPermission(user.roles, "settings:write");
  const { id } = await params;
  const asked = await searchParams;
  if (!objectId.safeParse(id).success) notFound();
  const product = await Product.findOne({ _id: id, ...notDeleted });
  if (!product) notFound();
  const [categories, packs, providers] = await Promise.all([
    Category.find({}).sort({ "name.en": 1 }),
    // purchase prices are read for owners only
    ProductVariant.find({ productId: product._id, ...notDeleted }).select(isOwner ? "+costPaise" : "").sort({ sku: 1 }),
    // its own provider stays in the list whatever its status, so saving never drops it unseen
    Provider.find({ $or: [{ status: { $in: ["active", "pending"] } }, { _id: product.providerId ?? null }] })
      .sort({ name: 1 })
      .select("name town status")
      .lean<{ _id: unknown; name: string; town: string; status: ProviderOption["status"] }[]>(),
  ]);
  const [stock, waiting] = await Promise.all([
    InventoryItem.find({ variantId: { $in: packs.map((pack) => pack._id) } }),
    // price and stock changes for its packs, new pack sizes for it and deletes, that an owner hasn't decided yet
    ApprovalRequest.find({
      state: "pending",
      $or: [
        { kind: { $in: ["price", "stock", "delete-pack"] }, targetId: { $in: packs.map((pack) => pack._id) } },
        { kind: "variant", "after.productId": id },
        { kind: "delete-product", targetId: id },
      ],
    }).sort({ createdAt: 1 }),
  ]);
  const describeRequest = (request: { kind: string; targetId: unknown; after: Record<string, unknown> }) => {
    const pack = packs.find((item) => String(item._id) === String(request.targetId));
    if (request.kind === "variant") return `New pack: ${String(request.after.label)} at ${formatPrice(Number(request.after.pricePaise))}`;
    if (request.kind === "delete-product") return "Delete this product";
    if (request.kind === "delete-pack") return `Delete the pack ${pack?.label ?? ""}`;
    if (request.kind === "price") return `${pack?.label ?? "Pack"}: price to ${formatPrice(Number(request.after.pricePaise))}`;
    return `${pack?.label ?? "Pack"}: stock ${Number(request.after.delta) > 0 ? "+" : ""}${Number(request.after.delta)}`;
  };
  const photos = orderedPhotos(product);
  // products sit on shelves; a section only groups them (its own category stays offered, whatever it is)
  const sectionIds = new Set(categories.flatMap((item) => parentsOf(item)));
  const shelves = categories.filter((item) => !sectionIds.has(String(item._id)) || String(item._id) === String(product.categoryId));
  const alsoOn = (product.alsoOn ?? []) as string[];
  const category = categories.find((item) => String(item._id) === String(product.categoryId));
  const live = product.status === "published";
  const inShop = isShopperVisible(product);
  const forCustomers = product.showToCustomers !== false;
  const forSchools = product.showToSchools === true;
  const stockOf = (packId: unknown) => stock.find((row) => String(row.variantId) === String(packId));
  const changing = asked.pack ? packs.find((pack) => String(pack._id) === asked.pack) : undefined;
  const stockHref = (packId: unknown, mode: "add" | "remove") => `/admin/products/${id}?pack=${packId}&mode=${mode}`;
  return (
    <section className="page-container">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/admin/products">Products</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{product.name.en}</span>
      </nav>
      <PageHeading
        eyebrow={category?.name.en ?? product.categorySlug}
        title={product.name.en}
        lead={<StatusPill value={product.status}>{STATUS_NAMES[product.status] ?? product.status}</StatusPill>}
        aside={
          inShop ? (
            <Link href={`/products/${product.slug}`} className="secondary-button" target="_blank">
              View in the shop <ExternalLink size={16} aria-hidden="true" />
            </Link>
          ) : null
        }
      />
      <div className="editor-layout">
        <ActionForm action={catalogManagementAction} submit="Save product details" className="form-stack panel">
          <input type="hidden" name="operation" value="product" />
          <input type="hidden" name="productId" value={id} />
          <fieldset className="form-section">
            <legend>Name and description</legend>
            <div className="staff-form-grid">
              <label>
                English name
                <input name="nameEn" defaultValue={product.name.en} required />
              </label>
              <label>
                Marathi name
                <input name="nameMr" defaultValue={product.name.mr} required lang="mr" />
              </label>
            </div>
            <label>
              English description
              <textarea name="descriptionEn" defaultValue={product.description.en} required />
            </label>
            <label>
              Marathi description
              <textarea name="descriptionMr" defaultValue={product.description.mr} required lang="mr" />
            </label>
          </fieldset>
          <fieldset className="form-section">
            <legend>How shoppers find it</legend>
            <div className="staff-form-grid">
              <label>
                Category
                <select name="categoryId" defaultValue={String(product.categoryId)}>
                  {shelves.map((item) => (
                    <option value={String(item._id)} key={String(item._id)}>
                      {item.name.en}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Brand
                <input name="brand" defaultValue={product.brand} />
              </label>
              <ProviderPicker
                owner={isOwner}
                value={product.providerId ? String(product.providerId) : ""}
                providers={providers.map((p) => ({ id: String(p._id), name: p.name, town: p.town, status: p.status }))}
              />
            </div>
            <details className="also-on" open={alsoOn.length > 0}>
              <summary>
                Also show it on <small>{alsoOn.length ? "" : "Optional: up to two more categories, for a product people look for in two places"}</small>
              </summary>
              <div className="tick-grid">
                {shelves
                  .filter((item) => String(item._id) !== String(product.categoryId))
                  .map((item) => (
                    <label className="checkbox-label" key={String(item._id)}>
                      <input type="checkbox" name="alsoOn" value={item.slug} defaultChecked={alsoOn.includes(item.slug)} />
                      {item.name.en}
                    </label>
                  ))}
              </div>
            </details>
            <label>
              Other words shoppers type <small>Separated by commas, English or Marathi</small>
              <input name="aliases" defaultValue={product.aliases.join(", ")} />
            </label>
          </fieldset>
          <fieldset className="form-section">
            <legend>Extra details</legend>
            <div className="staff-form-grid">
              <label>
                English highlights <small>One per line</small>
                <textarea
                  name="highlightsEn"
                  defaultValue={(product.highlights ?? []).map((item: { en: string }) => item.en).join("\n")}
                />
              </label>
              <label>
                Marathi highlights <small>One per line</small>
                <textarea
                  name="highlightsMr"
                  lang="mr"
                  defaultValue={(product.highlights ?? []).map((item: { mr: string }) => item.mr).join("\n")}
                />
              </label>
            </div>
            <label>
              Specifications <small>One per line: label EN | label MR | value EN | value MR</small>
              <textarea
                name="specifications"
                defaultValue={(product.specifications ?? [])
                  .map(
                    (item: { label: { en: string; mr: string }; value: { en: string; mr: string } }) =>
                      `${item.label.en} | ${item.label.mr} | ${item.value.en} | ${item.value.mr}`,
                  )
                  .join("\n")}
              />
            </label>
            <label>
              Tags <small>Separated by commas</small>
              <input name="dietaryTags" defaultValue={(product.dietaryTags ?? []).join(", ")} />
            </label>
          </fieldset>
          <fieldset className="form-section">
            <legend>Tax <small>Printed on school quotations</small></legend>
            <div className="staff-form-grid">
              <label>
                GST rate
                <select name="gstRatePercent" defaultValue={product.gstRatePercent ?? ""}>
                  <option value="">Not set</option>
                  {GST_RATES.map((rate) => (
                    <option value={rate} key={rate}>
                      {rate}%
                    </option>
                  ))}
                </select>
              </label>
              <label>
                HSN code <small>4, 6 or 8 digits</small>
                <input
                  name="hsnCode"
                  defaultValue={product.hsnCode ?? ""}
                  inputMode="numeric"
                  pattern="[0-9]{4}([0-9]{2}){0,2}"
                  maxLength={8}
                  autoComplete="off"
                />
              </label>
            </div>
          </fieldset>
          <fieldset className="form-section">
            <legend>Where it shows</legend>
            <label className="checkbox-label">
              <input type="checkbox" name="featured" defaultChecked={product.featured} /> Feature on the home page
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="bestseller" defaultChecked={product.bestseller} /> Mark as popular
            </label>
          </fieldset>
        </ActionForm>
        <aside className="editor-side">
          <div className="panel visibility-panel">
            <h2>In the shop</h2>
            <p>
              {inShop ? (
                <StatusPill tone="ok">Shoppers can see and buy it</StatusPill>
              ) : live ? (
                <StatusPill tone="warn">Schools only: shoppers can’t see it</StatusPill>
              ) : (
                <StatusPill tone="bad">Hidden from shoppers and schools</StatusPill>
              )}
            </p>
            <ActionForm
              action={catalogManagementAction}
              submit={live ? "Hide from the shop" : "Show in the shop"}
              buttonClassName={live ? "secondary-button" : "primary-button"}
              confirmMessage={
                live
                  ? "Shoppers won’t see or buy it until you show it again. Baskets holding it will ask to remove it."
                  : undefined
              }
            >
              <input type="hidden" name="operation" value="visibility" />
              <input type="hidden" name="productId" value={id} />
              <input type="hidden" name="visible" value={live ? "hide" : "show"} />
            </ActionForm>
            <DeleteRow
              target="product"
              id={id}
              owner={isOwner}
              held={stock.reduce((sum, row) => sum + row.reserved, 0)}
              waiting={waiting.some((request) => request.kind === "delete-product")}
              onHand={stock.reduce((sum, row) => sum + row.onHand, 0)}
              packs={packs.length}
            />
          </div>
          <div className="panel audience-panel">
            <h2>Who can see it</h2>
            <ActionForm action={catalogManagementAction} submit="Save who can see it" buttonClassName="secondary-button">
              <input type="hidden" name="operation" value="audience" />
              <input type="hidden" name="productId" value={id} />
              <label className="checkbox-label">
                <input type="checkbox" name="showToCustomers" defaultChecked={forCustomers} /> Customers
                <small>In the shop, search, baskets and wishlists</small>
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="showToSchools" defaultChecked={forSchools} /> Schools
                <small>In the school catalogue, for quotations</small>
              </label>
            </ActionForm>
          </div>
          <div className="panel" id="photos">
            <h2>Photos</h2>
            <p className="muted">The first photo is the cover: it shows on cards, in search and in the basket.</p>
            <ProductPhotos
              mode="edit"
              productId={id}
              initial={photos}
              fallback={productImages[product.slug]}
              name={product.name.en}
            />
          </div>
          <div className="panel">
            <h2>Packs and prices</h2>
            {packs.length ? (
              <ul className="pack-list">
                {packs.map((pack) => (
                  <PackCard
                    key={String(pack._id)}
                    pack={pack}
                    stock={stockOf(pack._id)}
                    owner={isOwner}
                    stockHref={(mode) => stockHref(pack._id, mode)}
                    deleteWaiting={waiting.some((request) => request.kind === "delete-pack" && String(request.targetId) === String(pack._id))}
                  />
                ))}
              </ul>
            ) : (
              <p className="muted">No pack yet, so shoppers cannot buy this product.</p>
            )}
            {waiting.length > 0 && (
              <div className="waiting-requests">
                <h3>Waiting for an owner</h3>
                <ul>
                  {waiting.map((request) => (
                    <li key={String(request._id)}>
                      <span>{describeRequest(request)}</span>
                      <ActionForm
                        action={governanceAction}
                        submit="Withdraw"
                        className="form-stack inline-grant"
                        buttonClassName="secondary-button compact-button"
                      >
                        <input type="hidden" name="operation" value="withdraw" />
                        <input type="hidden" name="requestId" value={String(request._id)} />
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link href={`/admin/inventory?new=pack&product=${id}#new-pack`} className="pack-add">
              <Plus size={16} aria-hidden="true" /> Add another pack size
            </Link>
          </div>
        </aside>
      </div>
      <RecordHistory target={id} title="Product history" />
      {changing && (
        <StockChangeDialog
          key={`${changing._id}-${asked.mode}`}
          variantId={String(changing._id)}
          name={`${product.name.en} · ${changing.label}`}
          mode={asked.mode === "remove" ? "remove" : "add"}
          onHand={stockOf(changing._id)?.onHand ?? 0}
          reserved={stockOf(changing._id)?.reserved ?? 0}
          owner={isOwner}
          closeHref={`/admin/products/${id}`}
        />
      )}
    </section>
  );
}
