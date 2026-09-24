import Link from "next/link";
import type { Model } from "mongoose";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { InventoryItem } from "@/lib/db/models";
import { CODCollection } from "@/lib/operations/models";
import { ChatConversation } from "@/lib/chat/models";
import { Complaint } from "@/lib/aftercare/models";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import {
  Boxes,
  ChartNoAxesCombined,
  HandCoins,
  Headphones,
  Inbox,
  MessageSquareWarning,
  UsersRound,
} from "lucide-react";
import { formatPrice } from "@/lib/display";
import { PageHeading } from "@/components/page-heading";
import { StatTiles } from "@/components/stat-tiles";
import { NavTiles } from "@/components/nav-tiles";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";

const WORKSPACES = [
  {
    href: "/admin/customers",
    title: "Customers",
    description: "Orders and support context",
    icon: UsersRound,
  },
  {
    href: "/admin/cod",
    title: "COD desk",
    description: "Cash and discrepancies",
    icon: HandCoins,
  },
  {
    href: "/admin/analytics",
    title: "Analytics",
    description: "Sales, stock & delivery",
    icon: ChartNoAxesCombined,
  },
  {
    href: "/admin/products",
    title: "Catalog",
    description: "Products & inventory",
    icon: Boxes,
  },
  {
    href: "/admin/support",
    title: "Support",
    description: "Customer conversations",
    icon: Headphones,
  },
  {
    href: "/admin/complaints",
    title: "Aftercare",
    description: "Complaints & returns",
    icon: MessageSquareWarning,
  },
];

/** Each queue: how many items wait, and how long the oldest has waited. */
type Queue = { label: string; href: string; count: number; oldest: Date | null };
async function queue(
  label: string,
  href: string,
  model: Model<unknown>,
  filter: object,
  sortField: string,
): Promise<Queue> {
  const [count, oldest] = await Promise.all([
    model.countDocuments(filter),
    model.findOne(filter).sort({ [sortField]: 1 }).select(sortField).lean() as Promise<
      Record<string, Date> | null
    >,
  ]);
  return { label, href, count, oldest: oldest?.[sortField] ?? null };
}
function waitingFor(since: Date | null) {
  if (!since) return "clear";
  const minutes = Math.max(1, Math.round((Date.now() - since.getTime()) / 60000));
  if (minutes < 60) return `oldest waiting ${minutes} min`;
  if (minutes < 60 * 24) return `oldest waiting ${Math.round(minutes / 60)} h`;
  return `oldest waiting ${Math.round(minutes / 1440)} d`;
}

export default async function Admin() {
  const user = await requirePage("order:manage");
  const [orders, lowStock, cashOpen, queues] = await Promise.all([
    Order.find({}).sort({ createdAt: -1 }).limit(100),
    InventoryItem.countDocuments({
      $expr: { $lte: [{ $subtract: ["$onHand", "$reserved"] }, 10] },
    }),
    CODCollection.find({ reconciledAt: null }).select("collectedPaise"),
    Promise.all([
      queue("Orders awaiting confirmation", "/admin", Order, { orderStatus: "placed" }, "createdAt"),
      queue("Orders being packed", "/admin", Order, { fulfilmentStatus: "picking" }, "updatedAt"),
      queue("Packed, no rider assigned", "/admin", Order, { fulfilmentStatus: "ready", deliveryStatus: "unassigned" }, "updatedAt"),
      queue("Cash collections to reconcile", "/admin/cod", CODCollection, { reconciledAt: null }, "createdAt"),
      queue("Support chats waiting for a reply", "/admin/support", ChatConversation, { status: "waiting-support" }, "updatedAt"),
      queue("Open complaints", "/admin/complaints", Complaint, { status: "open" }, "createdAt"),
    ]),
  ]);
  const awaiting = queues[0].count;
  const packing = queues[1].count;
  const cash = cashOpen.reduce((sum, item) => sum + item.collectedPaise, 0);
  return (
    <section className="page-container">
      <PageHeading
        eyebrow="Store operations"
        title={`Welcome, ${user.name}`}
        lead="Orders, shelves and customer care in one place."
        aside={
          <span className="live-chip">
            <i /> Live workspace
          </span>
        }
      />
      <StatTiles
        items={[
          { label: "Awaiting confirmation", value: awaiting },
          { label: "Being packed", value: packing },
          { label: "Low-stock packs", value: lowStock, href: "/admin/inventory" },
          { label: "Cash to reconcile", value: formatPrice(cash), href: "/admin/cod" },
        ]}
      />
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Work queue</span>
            <h2>Waiting on the team</h2>
          </div>
          <span className="muted">Refreshes when you return to this tab</span>
        </div>
        <ul className="work-queue">
          {queues.map((item) => (
            <li key={item.label} className={item.count ? "" : "clear"}>
              <Link href={item.href}>
                <strong>{item.count}</strong>
                <span>{item.label}</span>
                <small>{waitingFor(item.oldest)}</small>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <RefreshOnFocus />
      <NavTiles items={WORKSPACES} label="Admin workspaces" />
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Today’s flow</span>
            <h2>Incoming orders</h2>
          </div>
          <span className="order-count">{orders.length} shown</span>
        </div>
        <DataTable
          bare
          caption="Recent orders with customer, delivery window, status and total"
          rows={orders}
          rowKey={(order) => String(order._id)}
          columns={[
            {
              header: "Order",
              cell: (order) => (
                <Link href={`/admin/orders/${order._id}`}>{order.number}</Link>
              ),
            },
            { header: "Customer", cell: (order) => order.address.name },
            {
              header: "Delivery",
              cell: (order) => `${order.deliveryDate} · ${order.deliveryWindow}`,
            },
            {
              header: "Order status",
              cell: (order) => <StatusPill value={order.orderStatus} />,
            },
            {
              header: "Payment",
              cell: (order) => (
                <>
                  {order.paymentMethod.toUpperCase()}{" "}
                  <StatusPill value={order.paymentStatus} />
                </>
              ),
            },
            {
              header: "Total",
              numeric: true,
              cell: (order) => formatPrice(order.totalPaise),
            },
          ]}
          empty={
            <EmptyState
              icon={Inbox}
              title="No orders yet"
              body="New orders land here the moment a customer checks out."
              heading="h3"
            />
          }
        />
      </div>
      <p className="muted">
        Open an order to confirm, pack, assign delivery, or reconcile collected
        cash.
      </p>
    </section>
  );
}
