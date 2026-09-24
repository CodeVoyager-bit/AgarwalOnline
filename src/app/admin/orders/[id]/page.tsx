import { notFound } from "next/navigation";
import { formatPrice } from "@/lib/display";
import { StatusStrip } from "@/components/status-pill";
import { PageHeading } from "@/components/page-heading";
import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { Order, OrderTimelineEvent } from "@/lib/commerce/models";
import { User } from "@/lib/db/models";
import { PackingChecklist, CODCollection } from "@/lib/operations/models";
import { objectId } from "@/lib/commerce/service";
import { ActionForm } from "@/components/action-form";
import { operationAction } from "@/lib/operations/actions";
import { evidenceAction } from "@/lib/evidence/actions";
import { UploadedEvidence } from "@/lib/evidence/models";
function Hidden({ id, operation }: { id: string; operation: string }) {
  return (
    <>
      <input type="hidden" name="orderId" value={id} />
      <input type="hidden" name="operation" value={operation} />
    </>
  );
}
export default async function ManageOrder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePage("order:manage");
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();
  const o = await Order.findById(id);
  if (!o) notFound();
  const packing = await PackingChecklist.findOne({ orderId: id });
  const cash = await CODCollection.findOne({ orderId: id });
  const partners = await User.find({ roles: "delivery", active: true }).select(
    "name",
  );
  const events = await OrderTimelineEvent.find({ orderId: id }).sort({ at: 1 });
  const evidence = await UploadedEvidence.find({ orderId: id }).sort({
    createdAt: -1,
  });
  const next =
    o.orderStatus === "placed"
      ? { dimension: "order", next: "confirmed", label: "Confirm order" }
      : o.deliveryStatus === "delivered" && o.orderStatus === "confirmed"
        ? { dimension: "order", next: "completed", label: "Complete order" }
        : o.orderStatus === "confirmed" && o.fulfilmentStatus === "unassigned"
          ? { dimension: "fulfilment", next: "picking", label: "Start picking" }
          : o.fulfilmentStatus === "picking"
            ? { dimension: "fulfilment", next: "packed", label: "Mark packed" }
            : o.fulfilmentStatus === "packed"
              ? {
                  dimension: "fulfilment",
                  next: "ready",
                  label: "Ready for pickup",
                }
              : null;
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Order"
        title={o.number}
        lead={`${o.address.name} · ${o.deliveryDate} · ${o.deliveryWindow}`}
        aside={
          <Link href="/admin" className="secondary-button">
            Back to orders
          </Link>
        }
      />
      <StatusStrip
        items={[
          { label: "Order", value: o.orderStatus },
          { label: "Packing", value: o.fulfilmentStatus },
          { label: "Delivery", value: o.deliveryStatus },
          { label: "Payment", value: o.paymentStatus },
        ]}
      />
      <div className="basket-layout">
        <div>
          <div className="panel">
            <h2>Packing checklist</h2>
            <ActionForm action={evidenceAction} submit="Upload packing photo">
              <input type="hidden" name="purpose" value="packing" />
              <input type="hidden" name="orderId" value={id} />
              <label>
                Packing photograph
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                />
              </label>
            </ActionForm>
            <div className="evidence-strip">
              {evidence.map((item) => (
                <a
                  key={String(item._id)}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.purpose.replaceAll("-", " ")} photo
                </a>
              ))}
            </div>
            {o.fulfilmentStatus === "picking" ? (
              <ActionForm
                action={operationAction}
                submit="Save packing checklist"
              >
                <Hidden id={id} operation="packing" />
                {o.items.map(
                  (i: {
                    variantId: string;
                    name: string;
                    label: string;
                    quantity: number;
                  }) => (
                    <fieldset
                      className="packing-item"
                      key={String(i.variantId)}
                    >
                      <legend>
                        {i.name} · {i.label}
                      </legend>
                      <p>Ordered: {i.quantity}</p>
                      <label>
                        Packed quantity
                        <input
                          name={`packed_${i.variantId}`}
                          type="number"
                          min={0}
                          max={i.quantity}
                          defaultValue={
                            packing?.items.find(
                              (p: { variantId: string }) =>
                                String(p.variantId) === String(i.variantId),
                            )?.packedQuantity ?? 0
                          }
                          required
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          name={`missing_${i.variantId}`}
                        />
                        Item missing
                      </label>
                      <label>
                        Substitution, if customer approved
                        <input
                          name={`substitution_${i.variantId}`}
                          maxLength={120}
                          defaultValue={
                            packing?.items.find(
                              (p: { variantId: string }) =>
                                String(p.variantId) === String(i.variantId),
                            )?.substitution ?? ""
                          }
                        />
                      </label>
                    </fieldset>
                  ),
                )}
              </ActionForm>
            ) : (
              <ul>
                {o.items.map(
                  (i: {
                    variantId: string;
                    name: string;
                    label: string;
                    quantity: number;
                  }) => (
                    <li key={String(i.variantId)}>
                      {i.quantity} × {i.name} · {i.label}
                    </li>
                  ),
                )}
              </ul>
            )}
            {packing?.completedAt && (
              <p className="success-message">All quantities checked.</p>
            )}
          </div>
          <div className="panel">
            <h2>Timeline</h2>
            <ol>
              {events.map((e) => (
                <li key={String(e._id)}>
                  {e.dimension}: {e.previous} → {e.next}
                  <p className="muted">
                    {new Date(e.at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    {e.notes}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div>
          <div className="panel">
            <h2>Customer & delivery</h2>
            <p>
              {o.address.name}
              <br />
              {o.address.line}
              <br />
              {o.address.pin}
            </p>
            <p>
              {o.deliveryDate} · {o.deliveryWindow}
            </p>
            <strong>{formatPrice(o.totalPaise)}</strong>
            {next && (
              <ActionForm action={operationAction} submit={next.label}>
                <Hidden id={id} operation="status" />
                <input type="hidden" name="dimension" value={next.dimension} />
                <input type="hidden" name="next" value={next.next} />
              </ActionForm>
            )}
          </div>
          {o.fulfilmentStatus === "ready" &&
            o.deliveryStatus === "unassigned" && (
              <div className="panel">
                <h2>Assign delivery partner</h2>
                <ActionForm action={operationAction} submit="Assign delivery">
                  <Hidden id={id} operation="assign" />
                  <label>
                    Partner
                    <select name="partnerId" required>
                      <option value="">Choose partner</option>
                      {partners.map((p) => (
                        <option key={String(p._id)} value={String(p._id)}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </ActionForm>
              </div>
            )}
          {cash && (
            <div className="panel">
              <h2>Cash handover</h2>
              <p>Collected: {formatPrice(cash.collectedPaise)}</p>
              {!cash.reconciledAt ? (
                <ActionForm
                  action={operationAction}
                  submit="Record cash handover"
                >
                  <Hidden id={id} operation="reconcile" />
                  <label>
                    Cash received (paise)
                    <input
                      type="number"
                      name="receivedPaise"
                      min={0}
                      defaultValue={cash.collectedPaise}
                      required
                    />
                  </label>
                  <label>
                    Notes
                    <textarea name="note" maxLength={500} />
                  </label>
                </ActionForm>
              ) : (
                <>
                  <p>Received: {formatPrice(cash.receivedPaise)}</p>
                  <p
                    className={
                      cash.discrepancyPaise
                        ? "error-message"
                        : "success-message"
                    }
                  >
                    {cash.discrepancyPaise
                      ? `Discrepancy: ₹${cash.discrepancyPaise / 100}`
                      : "Cash reconciled"}
                  </p>
                  <p>{cash.reconciliationNote}</p>
                  {cash.discrepancyPaise && !cash.discrepancyResolvedAt ? (
                    <ActionForm
                      action={operationAction}
                      submit="Resolve discrepancy"
                    >
                      <Hidden id={id} operation="resolve-discrepancy" />
                      <label>
                        Resolution notes
                        <textarea
                          name="resolution"
                          minLength={5}
                          maxLength={500}
                          required
                        />
                      </label>
                    </ActionForm>
                  ) : cash.discrepancyResolvedAt ? (
                    <p className="success-message">
                      Resolved: {cash.discrepancyResolution}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
