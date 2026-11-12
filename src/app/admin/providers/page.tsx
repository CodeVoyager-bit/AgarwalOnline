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
import { taxProfile } from "@/lib/tax/profile";
import { istDate } from "@/lib/commerce/delivery";
import { caConfirmation } from "@/lib/providers/billing";
import { PROVIDER_BILL_STYLES, REGISTRATIONS, billingChecklist } from "@/lib/providers/billing-rules";
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
  billing?: {
    ownBills?: boolean;
    legalName?: string;
    registration?: string;
    gstin?: string;
    address?: string;
    prefix?: string;
    style?: string;
    agreementAt?: Date;
  };
};

const STATUS: Record<ProviderDoc["status"], { label: string; tone: "ok" | "warn" | "neutral" }> = {
  active: { label: "Live", tone: "ok" },
  pending: { label: "Waiting for owner", tone: "warn" },
  declined: { label: "Declined", tone: "neutral" },
};

/**
 * Tax and billing: whether the provider's items get a bill in its own name, and what goes on it. An owner's
 * change applies at once; an admin's waits for an owner. The checklist shows what still blocks own bills.
 */
function BillingSection({
  provider,
  isOwner,
  shopStateCode,
  ca,
  waiting,
}: {
  provider: ProviderDoc;
  isOwner: boolean;
  shopStateCode: string;
  ca: { confirmedAt: Date } | null;
  waiting: { by: string; at: Date } | null;
}) {
  const billing = provider.billing ?? {};
  const checklist = billingChecklist(
    { ...billing, agreement: Boolean(billing.agreementAt) },
    { stateCode: shopStateCode, caConfirmed: Boolean(ca), providerLive: provider.status === "active" },
  );
  const id = String(provider._id);
  return (
    <section className="provider-billing" aria-labelledby="billing-title">
      <h3 id="billing-title">Tax and billing</h3>
      <p className="muted">
        {billing.ownBills
          ? `Its items get a bill in its own name, ${billing.legalName}, numbered ${billing.prefix}/…, given at delivery.`
          : "Agarwal bills its items, as for our own stock. To give them a bill in the provider's own name, fill this in and finish the checklist."}
      </p>
      {waiting && (
        <p className="notice" role="status">
          A change from {waiting.by} waits for an owner (<When at={waiting.at} />). Bills don’t change until it’s approved.
        </p>
      )}
      <ul className="billing-checklist" aria-label="Before its items can be billed in its own name">
        {checklist.map((item) => (
          <li key={item.key} className={item.done ? "is-done" : undefined}>
            <span aria-hidden="true">{item.done ? "✓" : "○"}</span> {item.label}
            <span className="sr-only">{item.done ? ": done" : ": not yet"}</span>
          </li>
        ))}
      </ul>
      <ActionForm action={providerAction} submit={isOwner ? "Save tax and billing" : "Send to an owner"}>
        <input type="hidden" name="operation" value="billing" />
        <input type="hidden" name="providerId" value={id} />
        <fieldset className="day-picker">
          <legend>Who bills the customer for its items?</legend>
          <label className="checkbox-label">
            <input type="radio" name="ownBills" value="false" defaultChecked={!billing.ownBills} /> Agarwal, as now
          </label>
          <label className="checkbox-label">
            <input type="radio" name="ownBills" value="true" defaultChecked={Boolean(billing.ownBills)} /> The provider, in its own name
          </label>
        </fieldset>
        <div className="staff-form-grid">
          <label>
            Legal name on its bills
            <input name="legalName" defaultValue={billing.legalName} minLength={2} maxLength={120} placeholder="Kale Toys and Games" />
          </label>
          <label>
            GST registration
            <select name="registration" defaultValue={billing.registration ?? "unregistered"}>
              {REGISTRATIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            GSTIN <small>Checked as you save; it sets the state</small>
            <input name="gstin" defaultValue={billing.gstin} maxLength={15} placeholder="27ABCDE1234F1Z5" autoCapitalize="characters" />
          </label>
          <label>
            Bill number prefix <small>1 to 3 capital letters: KT gives KT/26-27/0001</small>
            <input name="prefix" defaultValue={billing.prefix} maxLength={3} pattern="[A-Za-z]{1,3}" autoCapitalize="characters" />
          </label>
          <label className="span-2">
            Address on its bills
            <textarea name="address" defaultValue={billing.address} minLength={5} maxLength={300} rows={2} />
          </label>
          <label>
            Bill style <small>Its bills only; Agarwal’s stay as set in Settings → Bills</small>
            <select name="style" defaultValue={billing.style ?? "same"}>
              {PROVIDER_BILL_STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="provider-style-previews">
            Preview with the saved details:{" "}
            {PROVIDER_BILL_STYLES.map((option, index) => (
              <span key={option.value}>
                {index > 0 && " · "}
                <a href={`/api/invoices/sample?provider=${id}&style=${option.value}`} target="_blank" rel="noreferrer">
                  {option.label}
                </a>
              </span>
            ))}
          </p>
        </div>
        <label className="checkbox-label">
          <input type="checkbox" name="agreement" defaultChecked={Boolean(billing.agreementAt)} /> {provider.name} has agreed in writing
          that we issue bills in its name
        </label>
      </ActionForm>
      {isOwner && (
        <ActionForm
          action={providerAction}
          submit={ca ? "Take back the CA's confirmation" : "Record the CA's confirmation"}
          buttonClassName="secondary-button"
          className="form-stack provider-ca"
          confirmMessage={
            ca
              ? "Taking it back switches every provider to Agarwal's bills for new orders. Bills already given stay as they are."
              : undefined
          }
        >
          <input type="hidden" name="operation" value="ca" />
          <input type="hidden" name="confirmed" value={ca ? "false" : "true"} />
          <p className="muted">
            {ca ? (
              <>
                You recorded on <When at={ca.confirmedAt} /> that your CA confirmed Agarwal’s e-commerce (TCS) registration. It
                counts for every provider.
              </>
            ) : (
              "Before any provider bills in its own name, ask your CA: Agarwal then sells for other sellers, which usually means GST TCS registration and a monthly return. Record their confirmation here, once for the shop."
            )}
          </p>
        </ActionForm>
      )}
    </section>
  );
}

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
  const canExport = hasPermission(user.roles, "analytics:read");
  const thisMonth = istDate(new Date()).slice(0, 7);
  const params = await searchParams;
  const [providers, counts, waitingProducts, shop, ca, billingWaits] = await Promise.all([
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
    taxProfile(),
    caConfirmation(),
    // tax and billing changes an admin asked for, waiting for an owner
    ApprovalRequest.find({ kind: "provider-billing", state: "pending" }).select("targetId requesterId createdAt").lean<
      { targetId: unknown; requesterId: unknown; createdAt: Date }[]
    >(),
  ]);
  const waitingFor = (id: unknown) => waitingProducts.find((row) => String(row._id) === String(id))?.count ?? 0;
  const adders = await User.find({
    _id: { $in: [...providers.map((p) => p.createdBy), ...billingWaits.map((wait) => wait.requesterId)] },
  })
    .select("name roles")
    .lean<
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
        lead="Other shops whose items we sell. Shoppers see the name and town under each of their items. We deliver and collect the payment; Agarwal bills them unless a provider is set to bill in its own name."
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
          <BillingSection
            provider={editing}
            isOwner={isOwner}
            shopStateCode={shop.stateCode}
            ca={ca}
            waiting={(() => {
              const wait = billingWaits.find((candidate) => String(candidate.targetId) === String(editing._id));
              return wait ? { by: addedBy(wait.requesterId), at: wait.createdAt } : null;
            })()}
          />
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
      {providers.some((provider) => provider.billing?.ownBills) && canExport && (
        // the month's bills providers gave in their own name, for the CA's returns
        <form className="provider-bills-export" action="/api/staff/export/provider-bills" method="get">
          <label>
            Provider bills for the month
            <input type="month" name="month" defaultValue={thisMonth} />
          </label>
          <button type="submit" className="secondary-button">
            Download Excel
          </button>
        </form>
      )}
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
          {
            header: "Bills",
            text: (provider) => (provider.billing?.ownBills ? "Its own" : "Agarwal"),
            cell: (provider) =>
              provider.billing?.ownBills ? (
                <span>
                  Its own <small>{provider.billing.gstin}</small>
                </span>
              ) : (
                "Agarwal"
              ),
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
