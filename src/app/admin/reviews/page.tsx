import { requirePage } from "@/lib/auth/session";
import { Sparkles } from "lucide-react";
import { ProductReview, ReviewReport } from "@/lib/reviews/models";
import { Product, User } from "@/lib/db/models";
import { moderateReviewAction } from "@/lib/reviews/actions";
import { ActionForm } from "@/components/action-form";

export default async function ReviewModerationPage() {
  await requirePage("review:moderate");
  const reports = await ReviewReport.find({ status: "open" }).sort({ createdAt: -1 }).limit(100);
  const reviews = await ProductReview.find({ _id: { $in: reports.map((report) => report.reviewId) } });
  const [products, customers] = await Promise.all([
    Product.find({ _id: { $in: reviews.map((review) => review.productId) } }).select("name"),
    User.find({ _id: { $in: reviews.map((review) => review.customerId) } }).select("name"),
  ]);
  return (
    <section className="page-container">
      <div className="workspace-heading"><div><span className="eyebrow">TRUST & SAFETY</span><h1>Review moderation</h1><p>Only reported verified-purchase reviews appear here.</p></div><span className="order-count">{reports.length} open</span></div>
      {reports.map((report) => {
        const review = reviews.find((item) => String(item._id) === String(report.reviewId));
        if (!review) return null;
        const product = products.find((item) => String(item._id) === String(review.productId));
        const customer = customers.find((item) => String(item._id) === String(review.customerId));
        return (
          <article className="panel" key={String(report._id)}>
            <div className="panel-heading"><div><span className="eyebrow">{"★".repeat(review.rating)} · VERIFIED PURCHASE</span><h2>{product?.name.en ?? "Product review"}</h2></div><span className="status-pill">Reported</span></div>
            <h3>{review.title}</h3><p>{review.body}</p><p className="muted">By {customer?.name ?? "Customer"} · Report reason: {report.reason}</p>
            <ActionForm action={moderateReviewAction} submit="Save moderation">
              <input type="hidden" name="reviewId" value={String(review._id)} />
              <label>Decision<select name="status" defaultValue="hidden"><option value="hidden">Hide review</option><option value="published">Keep published</option></select></label>
              <label>Moderation note<input name="reason" minLength={3} maxLength={300} required /></label>
            </ActionForm>
          </article>
        );
      })}
      {!reports.length && <div className="panel empty-state"><Sparkles size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" /><h2>Moderation queue is clear</h2><p>Reported reviews will appear here for staff review.</p></div>}
    </section>
  );
}
