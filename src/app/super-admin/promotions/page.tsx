import { requirePage } from "@/lib/auth/session";
import { TicketPercent } from "lucide-react";
import { formatPrice } from "@/lib/display";
import { Promotion } from "@/lib/promotions/models";
import { promotionAdminAction } from "@/lib/promotions/actions";
import { ActionForm } from "@/components/action-form";

export default async function PromotionsPage() {
  await requirePage("promotion:write");
  const promotions = await Promotion.find({}).sort({ createdAt: -1 }).limit(100);
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div><span className="eyebrow">MERCHANDISING</span><h1>Promotions</h1><p>Run one transparent best-value cart offer at a time.</p></div>
        <span className="live-chip"><i /> {promotions.filter((item) => item.active).length} active</span>
      </div>
      <div className="settings-grid">
        <div className="panel">
          <h2>Create an offer</h2>
          <ActionForm action={promotionAdminAction} submit="Create promotion">
            <input type="hidden" name="operation" value="create" />
            <label>Name<input name="name" minLength={3} maxLength={80} required /></label>
            <label>Type<select name="kind" defaultValue="code"><option value="code">Coupon code</option><option value="automatic">Automatic best offer</option></select></label>
            <label>Coupon code<input name="code" maxLength={24} placeholder="LOCAL10" /></label>
            <label>Discount<select name="discountType" defaultValue="percentage"><option value="percentage">Percentage</option><option value="fixed">Fixed amount in paise</option></select></label>
            <label>Discount value<input name="discountValue" type="number" min={1} required /></label>
            <label>Minimum subtotal (paise)<input name="minimumSubtotalPaise" type="number" min={0} defaultValue={0} required /></label>
            <label>Maximum discount (paise)<input name="maximumDiscountPaise" type="number" min={0} /></label>
            <label>Starts<input name="startsAt" type="datetime-local" required /></label>
            <label>Ends<input name="endsAt" type="datetime-local" required /></label>
            <label><input name="active" type="checkbox" /> Publish immediately</label>
          </ActionForm>
        </div>
        <div>
          {promotions.map((promotion) => (
            <article className="panel" key={String(promotion._id)}>
              <div className="panel-heading"><div><span className="eyebrow">{promotion.kind}</span><h2>{promotion.name}</h2></div><span className={`staff-state ${promotion.active ? "active" : "inactive"}`}>{promotion.active ? "Active" : "Inactive"}</span></div>
              <p>{promotion.code ? `${promotion.code} · ` : ""}{promotion.discountType === "percentage" ? `${promotion.discountValue}% off` : `₹${promotion.discountValue / 100} off`}</p>
              <p className="muted">Minimum {formatPrice(promotion.minimumSubtotalPaise)} · {promotion.redemptionCount} redemptions · ends {new Date(promotion.endsAt).toLocaleDateString("en-IN")}</p>
              <ActionForm
                action={promotionAdminAction}
                submit={promotion.active ? "Pause promotion" : "Publish promotion"}
                confirmMessage={`${promotion.active ? "Pause" : "Publish"} ${promotion.name}? This changes the offer customers can receive at checkout.`}
              >
                <input type="hidden" name="operation" value="toggle" />
                <input type="hidden" name="promotionId" value={String(promotion._id)} />
              </ActionForm>
            </article>
          ))}
          {!promotions.length && <div className="panel empty-state"><TicketPercent size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" /><h2>No promotions yet</h2><p>Create an automatic offer or coupon for your customers.</p></div>}
        </div>
      </div>
    </section>
  );
}
