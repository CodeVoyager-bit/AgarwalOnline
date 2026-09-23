import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { CODCollection } from "@/lib/operations/models";
import { istDate } from "@/lib/commerce/delivery";
import { displayStatus } from "@/lib/display";
export default async function Delivery() {
  const user = await requirePage("delivery:assigned");
  const orders = await Order.find({
    assignedTo: user.id,
    orderStatus: "confirmed",
    deliveryStatus: { $in: ["assigned", "out-for-delivery", "attempted"] },
  })
    .sort({ deliveryDate: 1 })
    .select(
      "number deliveryDate deliveryWindow deliveryStatus totalPaise paymentMethod",
    );
  const history = await Order.find({
    assignedTo: user.id,
    deliveryStatus: "delivered",
  })
    .select("number deliveryDate totalPaise")
    .sort({ updatedAt: -1 })
    .limit(30);
  const cash = await CODCollection.find({
    collectorId: user.id,
    reconciledAt: null,
  }).select("collectedPaise");
  const today = istDate(new Date());
  const [deliveredToday, attemptsToday] = await Promise.all([
    Order.countDocuments({
      assignedTo: user.id,
      deliveryStatus: "delivered",
      deliveryDate: today,
    }),
    Order.countDocuments({
      assignedTo: user.id,
      deliveryStatus: "attempted",
      deliveryDate: today,
    }),
  ]);
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div><span className="eyebrow">YOUR DELIVERY DAY</span><h1>Hello, {user.name}</h1><p>Prioritised stops, collections and completed deliveries.</p></div>
        <span className="live-chip"><i /> Live queue</span>
      </div>
      <div className="status-strip">
        <span>{orders.length} active deliveries</span>
        <span>{deliveredToday} delivered today</span>
        <span>{attemptsToday} need another attempt</span>
        <span>
          Cash to hand over: ₹
          {cash.reduce((n, c) => n + c.collectedPaise, 0) / 100}
        </span>
      </div>
      <h2 className="queue-heading">Your queue</h2>
      {orders.length ? (
        orders.map((o) => (
          <Link
            className="panel order-row"
            key={String(o._id)}
            href={`/delivery/orders/${o._id}`}
          >
            <strong>{o.number}</strong>
            <span>
              {o.deliveryDate} · {o.deliveryWindow}
            </span>
            <span>{displayStatus(o.deliveryStatus)}</span>
            <strong>
              {o.paymentMethod === "cod"
                ? `Collect ₹${o.totalPaise / 100}`
                : "Prepaid"}{" "}
              →
            </strong>
          </Link>
        ))
      ) : (
        <div className="panel">
          <h3>You’re all caught up.</h3>
          <p>New deliveries will appear here when assigned to you.</p>
        </div>
      )}
      <h2>Recently delivered</h2>
      {history.length ? (
        <ul>
          {history.map((o) => (
            <li key={String(o._id)}>
              {o.number} · {o.deliveryDate}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={PackageCheck} title="No completed deliveries yet" body="Finished drops are listed here at the end of the round." heading="h3" />
      )}
    </section>
  );
}
