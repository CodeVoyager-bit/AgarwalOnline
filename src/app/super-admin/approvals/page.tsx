import { ApprovalDetails } from "@/components/approval-details";
import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { Category } from "@/lib/db/models";
import { requirePage } from "@/lib/auth/session";
import { ApprovalRequest, ApprovalHistory } from "@/lib/governance/models";
import { ActionForm } from "@/components/action-form";
import { governanceAction } from "@/lib/governance/actions";
export default async function Approvals() {
  const user = await requirePage("approval:review");
  const categories = await Category.find({}).select("name");
  const requests = await ApprovalRequest.find({})
    .sort({ createdAt: -1 })
    .limit(100);
  const history = await ApprovalHistory.find({
    requestId: { $in: requests.map((r) => r._id) },
  }).sort({ at: 1 });
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="A second pair of eyes"
        title="Approval queue"
        lead="Every product, price and stock change needs a second Super Admin."
      />
      {requests.length ? (
        requests.map((r) => (
          <article className="panel" key={String(r._id)}>
            <div className="order-row">
              <h2>
                {r.kind === "product" ? r.after.nameEn : `${r.kind} change`}
              </h2>
              <span className="status-pill">{r.state}</span>
            </div>
            <div className="approval-values">
              <div>
                <h3>Before</h3>
                <ApprovalDetails values={r.before} />
              </div>
              <div>
                <h3>Requested change</h3>
                <ApprovalDetails
                  values={r.after}
                  categoryName={
                    categories.find(
                      (c) => String(c._id) === String(r.after.categoryId),
                    )?.name.en
                  }
                />
              </div>
            </div>
            {r.state === "pending" && String(r.requesterId) !== user.id ? (
              <ActionForm action={governanceAction} submit="Save review">
                <input type="hidden" name="operation" value="review" />
                <input type="hidden" name="requestId" value={String(r._id)} />
                <label>
                  Decision
                  <select name="decision">
                    <option value="approved">Approve</option>
                    <option value="rejected">Reject</option>
                  </select>
                </label>
                <label>
                  Comment (required for rejection)
                  <textarea name="comment" maxLength={500} />
                </label>
                <label>
                  Optional scheduled publication (include timezone, e.g.
                  2026-10-01T09:00:00+05:30)
                  <input
                    name="scheduledAt"
                    placeholder="Leave blank to publish upon approval"
                  />
                </label>
              </ActionForm>
            ) : r.state === "pending" ? (
              <p className="notice">
                Another Super Admin must review your request.
              </p>
            ) : null}
            <details style={{ marginTop: 16 }}>
              <summary>Approval history</summary>
              <ul>
                {history
                  .filter((h) => String(h.requestId) === String(r._id))
                  .map((h) => (
                    <li key={String(h._id)}>
                      {h.previous} → {h.next} ·{" "}
                      {new Date(h.at).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}{" "}
                      {h.comment}
                    </li>
                  ))}
              </ul>
            </details>
          </article>
        ))
      ) : (
        <EmptyState icon={ClipboardCheck} title="Nothing awaiting review" body="Product, price and stock changes queue here for a second Super Admin." />
      )}
    </section>
  );
}
