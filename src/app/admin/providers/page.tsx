import Link from "next/link";
import mongoose from "mongoose";
import { Plus, Store } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { CatalogAdminNav } from "@/components/catalog-admin-nav";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { When } from "@/components/when";
import { requirePage } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { Product, User } from "@/lib/db/models";
import { Provider } from "@/lib/providers/models";
import { providerAction } from "@/lib/providers/actions";
import { ApprovalRequest } from "@/lib/governance/models";
import { notDeleted } from "@/lib/catalog/deleted";
export const metadata = { title: "Providers", robots: { index: false } };

type ProviderDoc = {
  _id: unknown;
  name: string;
  town: string;
  phone?: string;
  notes?: string;
  status: "pending" | "active" | "declined";
  createdBy: unknown;
  createdAt: Date;
  declineReason?: string;
};

const STATUS: Record<ProviderDoc["status"], { label: string; tone: "ok" | "warn" | "neutral" }> = {
  active: { label: "Live", tone: "ok" },
  pending: { label: "Waiting for owner", tone: "warn" },
  declined: { label: "Declined", tone: "neutral" },
};

/** The same four boxes for adding and editing, so the two forms can never drift apart. */
function ProviderFields({ provider }: { provider?: ProviderDoc }) {
  return (
    <div className="staff-form-grid">
      <label>
        Shop name <small>Shown to shoppers</small>
        <input name="name" defaultValue={provider?.name} required minLength={2} maxLength={60} placeholder="Sharma Stationers" />
      </label>
      <label>
        Town <small>Shown to shoppers</small>
        <input name="town" defaultValue={provider?.town} required minLength={2} maxLength={40} placeholder="Roha" />
      </label>
      <label>
        Phone <small>Optional · staff only</small>
        <input name="phone" defaultValue={provider?.phone} inputMode="numeric" pattern="[0-9]{10}" maxLength={10} />
      </label>
      <label>
        Notes <small>Optional · staff only, like how you settle with them</small>
        <input name="notes" defaultValue={provider?.notes} maxLength={500} />
      </label>
    </div>
  );
}

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; q?: string; status?: string }>;
}) {
  const user = await requirePage("catalog:write");
  const isOwner = hasPermission(user.roles, "approval:review");
  const params = await searchParams;
  const [providers, counts, waitingProducts] = await Promise.all([
    Provider.find({}).sort({ name: 1 }).limit(500).lean<ProviderDoc[]>(),
    Product.aggregate<{ _id: unknown; count: number }>([
      { $match: { providerId: { $exists: true }, ...notDeleted } },
      { $group: { _id: "$providerId", count: { $sum: 1 } } },
    ]),
    // new products waiting for an owner that name a provider: what an approval decision unblocks
    ApprovalRequest.aggregate<{ _id: unknown; count: number }>([
      { $match: { kind: "product", state: "pending", "after.providerId": { $exists: true } } },
      { $group: { _id: "$after.providerId", count: { $sum: 1 } } },
    ]),
  ]);
  const waitingFor = (id: unknown) => waitingProducts.find((row) => String(row._id) === String(id))?.count ?? 0;
  const adders = await User.find({ _id: { $in: providers.map((p) => p.createdBy) } }).select("name roles").lean<
    { _id: unknown; name: string; roles: string[] }[]
  >();
  const itemsOf = (id: unknown) => counts.find((row) => String(row._id) === String(id))?.count ?? 0;
  const addedBy = (id: unknown) => {
    const adder = adders.find((person) => String(person._id) === String(id));
    return adder ? `${adder.name}${adder.roles.includes("super-admin") ? " (owner)" : ""}` : "—";
  };
  const term = params.q?.trim().toLowerCase().slice(0, 80) ?? "";
  const shown = providers.filter(
    (provider) =>
      (!term || [provider.name, provider.town, provider.phone ?? ""].some((text) => text.toLowerCase().includes(term))) &&
      (!params.status || provider.status === params.status),
  );
  const waiting = providers.filter((provider) => provider.status === "pending").length;
  const filtered = Boolean(term || params.status);
  const editing =
    params.edit && mongoose.isValidObjectId(params.edit)
      ? providers.find((provider) => String(provider._id) === params.edit)
      : undefined;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Run the store"
        title="Providers"
        lead="Other shops whose items we sell. Shoppers see the name and town under each of their items; we still sell, bill and deliver."
        aside={
          <Link href="/admin/providers?edit=new#provider" className="primary-button">
            <Plus size={18} aria-hidden="true" /> Add a provider
          </Link>
        }
      />
      <CatalogAdminNav />
      {waiting > 0 && (
        <p className="notice" role="status">
          {isOwner ? "Waiting for you: " : "Waiting for an owner: "}
          <Link href="/admin/providers?status=pending">
            <strong>{waiting}</strong> new {waiting === 1 ? "provider" : "providers"}
          </Link>
          . Their names show to shoppers once approved.
        </p>
      )}
      {params.edit === "new" && (
        <div className="panel adjust-panel" id="provider">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">New provider</span>
              <h2>Add a provider</h2>
            </div>
            <Link href="/admin/providers" className="text-button">
              Close
            </Link>
          </div>
          {!isOwner && <p className="muted">An owner approves it before shoppers see the name.</p>}
          <ActionForm action={providerAction} submit="Add provider">
            <input type="hidden" name="operation" value="create" />
            <ProviderFields />
          </ActionForm>
        </div>
      )}
      {editing && (
        <div className="panel adjust-panel" id="provider">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                Provider · <StatusPill tone={STATUS[editing.status].tone}>{STATUS[editing.status].label}</StatusPill>
              </span>
              <h2>
                {editing.name}, {editing.town}
              </h2>
            </div>
            <Link href="/admin/providers" className="text-button">
              Close
            </Link>
          </div>
          {editing.status === "declined" && editing.declineReason && (
            <p className="muted">Declined: “{editing.declineReason}”. Adding it again sends it back to an owner.</p>
          )}
          {isOwner && editing.status === "pending" && (
            <div className="provider-decision">
              <p>
                Added by {addedBy(editing.createdBy)}, <When at={editing.createdAt} />.{" "}
                {waitingFor(editing._id) > 0
                  ? `${waitingFor(editing._id)} new ${waitingFor(editing._id) === 1 ? "product waits" : "products wait"} for it: approve it first, then ${waitingFor(editing._id) === 1 ? "the product" : "them"} on Approvals.`
                  : "No product waiting for approval names it yet."}
              </p>
              <div className="split-actions">
                <ActionForm action={providerAction} submit="Approve" className="list-inline-form">
                  <input type="hidden" name="operation" value="decide" />
                  <input type="hidden" name="providerId" value={String(editing._id)} />
                  <input type="hidden" name="decision" value="approve" />
                </ActionForm>
                <ActionForm action={providerAction} submit="Decline" buttonClassName="secondary-button" className="form-stack">
                  <input type="hidden" name="operation" value="decide" />
                  <input type="hidden" name="providerId" value={String(editing._id)} />
                  <input type="hidden" name="decision" value="decline" />
                  <label>
                    Reason for declining <small>Whoever added it is told</small>
                    <input name="reason" minLength={5} maxLength={300} required />
                  </label>
                </ActionForm>
              </div>
            </div>
          )}
          <ActionForm action={providerAction} submit="Save provider">
            <input type="hidden" name="operation" value="update" />
            <input type="hidden" name="providerId" value={String(editing._id)} />
            <ProviderFields provider={editing} />
          </ActionForm>
          <p className="muted">
            <Link href={`/admin/products?provider=${editing._id}`}>See its {itemsOf(editing._id)} items</Link>
          </p>
        </div>
      )}
      <FilterBar label="Find providers" submitLabel="Show providers" clearHref={filtered ? "/admin/providers" : undefined}>
        <label>
          Search <small>name, town or phone</small>
          <input name="q" defaultValue={params.q} maxLength={80} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={params.status ?? ""}>
            <option value="">All providers</option>
            <option value="active">Live</option>
            <option value="pending">Waiting for owner</option>
            <option value="declined">Declined</option>
          </select>
        </label>
      </FilterBar>
      <p className="results-line" role="status">
        <span>
          <strong>{shown.length}</strong> of {providers.length} {providers.length === 1 ? "provider" : "providers"}
        </span>
      </p>
      <DataTable
        caption="Providers with their town, items, status and who added them"
        exportName="Providers"
        rows={shown}
        rowKey={(provider) => String(provider._id)}
        columns={[
          {
            header: "Provider",
            text: (provider) => provider.name,
            cell: (provider) => (
              <>
                <Link href={`/admin/providers?edit=${provider._id}#provider`}>{provider.name}</Link>
                <small>{[provider.town, provider.phone].filter(Boolean).join(" · ")}</small>
              </>
            ),
          },
          {
            header: "Items",
            numeric: true,
            cell: (provider) => {
              const count = itemsOf(provider._id);
              return count ? <Link href={`/admin/products?provider=${provider._id}`}>{count}</Link> : "None";
            },
          },
          {
            header: "Status",
            cell: (provider) => <StatusPill tone={STATUS[provider.status].tone}>{STATUS[provider.status].label}</StatusPill>,
          },
          { header: "Added by", phone: "hide", cell: (provider) => addedBy(provider.createdBy) },
        ]}
        empty={
          <EmptyState
            icon={Store}
            title={filtered ? "No provider matches" : "No providers yet"}
            body={
              filtered
                ? "Check the spelling, or clear the filters."
                : "Add a shop whose items you sell, or add one while listing a product."
            }
            heading="h3"
            action={
              filtered ? undefined : (
                <Link href="/admin/providers?edit=new#provider" className="primary-button">
                  Add a provider
                </Link>
              )
            }
          />
        }
      />
    </section>
  );
}
