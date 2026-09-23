import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { Order } from "@/lib/commerce/models";
import { InventoryItem } from "@/lib/db/models";
import { CODCollection } from "@/lib/operations/models";
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

export default async function Admin() {
  const user = await requirePage("order:manage");
  const orders = await Order.find({}).sort({ createdAt: -1 }).limit(100);
  const [lowStock, cashOpen] = await Promise.all([
    InventoryItem.countDocuments({
      $expr: { $lte: [{ $subtract: ["$onHand", "$reserved"] }, 10] },
    }),
    CODCollection.find({ reconciledAt: null }).select("collectedPaise"),
  ]);
  const awaiting = orders.filter((order) => order.orderStatus === "placed").length;
  const packing = orders.filter((order) => order.fulfilmentStatus === "picking").length;
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
