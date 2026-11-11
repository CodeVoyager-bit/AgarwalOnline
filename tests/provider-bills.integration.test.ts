import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, User } from "../src/lib/db/models";
import { Order, Sequence, SystemSetting } from "../src/lib/commerce/models";
import { ApprovalHistory, ApprovalRequest } from "../src/lib/governance/models";
import { Provider } from "../src/lib/providers/models";
import { reviewApproval, submitProviderBilling } from "../src/lib/governance/service";
import { setCaConfirmation } from "../src/lib/providers/billing";
import { issueProviderBills } from "../src/lib/commerce/provider-bills";
import { financialYear } from "../src/lib/commerce/bill-split";
import { orderBillHtml } from "../src/lib/documents/order-bills";
import { billLink } from "../src/lib/documents/bill-request";
import { gstinCheckChar } from "../src/lib/tax/gst";

vi.mock("server-only", () => ({}));

const uri = process.env.TEST_MONGODB_URI;
const gstin = (first14: string) => first14 + gstinCheckChar(first14);
const SHOP_GSTIN = gstin("27AAAAA0000A1Z");
const PROVIDER_GSTIN = gstin("27ABCDE1234F1Z");

describe.skipIf(!uri)("Providers' own bills", () => {
  let owner: string, admin: string, customer: string, providerId: string;
  const details = (over: Record<string, unknown> = {}) => ({
    providerId,
    ownBills: "true",
    legalName: "Kale Toys and Games",
    registration: "regular",
    gstin: PROVIDER_GSTIN,
    address: "Shop 4, Station Road, Pali 410205",
    prefix: "KT",
    style: "ledger",
    agreement: "on",
    ...over,
  });

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, Order, Sequence, SystemSetting, ApprovalRequest, ApprovalHistory, Provider, AuditLog]) await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    owner = String((await User.create({ name: "Owner", phone: "9000000701", roles: ["customer", "super-admin"] }))._id);
    admin = String((await User.create({ name: "Admin Ravi", phone: "9000000702", roles: ["customer", "admin"] }))._id);
    customer = String((await User.create({ name: "Asha", phone: "9000000703", roles: ["customer"] }))._id);
    await SystemSetting.create({
      key: "tax-details",
      value: { legalName: "Agarwal General Stores", gstin: SHOP_GSTIN, address: "Main Road, Nagothane", stateCode: "27" },
    });
    providerId = String(
      (await Provider.create({ name: "Kale Toys", town: "Pali", slug: "kale-toys-pali", status: "active", createdBy: owner }))._id,
    );
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("waits for an owner when an admin changes a provider's tax details, and applies them once approved", async () => {
    expect(await submitProviderBilling(admin, details({ ownBills: "false" }))).toEqual({ live: false });
    expect((await Provider.findById(providerId)).billing?.legalName).toBeUndefined();
    const request = await ApprovalRequest.findOne({ kind: "provider-billing", state: "pending" });
    expect(String(request.targetId)).toBe(providerId);
    // only one change waits at a time
    await expect(submitProviderBilling(admin, details({ ownBills: "false" }))).rejects.toThrow(/already waiting/);
    await reviewApproval(owner, { requestId: String(request._id), decision: "approved", comment: "" });
    const provider = await Provider.findById(providerId);
    expect(provider.billing).toMatchObject({ legalName: "Kale Toys and Games", gstin: PROVIDER_GSTIN, stateCode: "27", prefix: "KT", ownBills: false });
    // the agreement is recorded as taken by whoever asked
    expect(String(provider.billing.agreementBy)).toBe(admin);
    expect(await AuditLog.exists({ action: "provider.billing", target: providerId })).toBeTruthy();
  });

  it("keeps own bills locked until the checklist is done, and the CA's word counts for every provider", async () => {
    await expect(submitProviderBilling(owner, details())).rejects.toThrow(/Finish the checklist.*CA/);
    await expect(setCaConfirmation(admin, true)).rejects.toThrow("FORBIDDEN");
    await setCaConfirmation(owner, true);
    await expect(submitProviderBilling(owner, details({ registration: "unregistered", gstin: "" }))).rejects.toThrow(/Registered under GST/);
    await expect(submitProviderBilling(owner, details({ gstin: gstin("29ABCDE1234F1Z") }))).rejects.toThrow(/the shop's own state/);
    await expect(submitProviderBilling(owner, details({ agreement: "" }))).rejects.toThrow(/agreed in writing/);
    // an owner's own change applies at once
    expect(await submitProviderBilling(owner, details())).toEqual({ live: true });
    expect((await Provider.findById(providerId)).billing.ownBills).toBe(true);
    // taking the CA's word back switches every provider to Agarwal's bills for new orders
    await setCaConfirmation(owner, false);
    expect((await Provider.findById(providerId)).billing.ownBills).toBe(false);
  });

  async function deliveredOrder(number: string, over: Record<string, unknown> = {}) {
    return Order.create({
      customerId: customer,
      number,
      idempotencyKey: number,
      items: [
        { variantId: new mongoose.Types.ObjectId(), name: "Long Book", label: "1 piece", quantity: 1, pricePaise: 10000, linePaise: 10000 },
        {
          variantId: new mongoose.Types.ObjectId(),
          name: "Toy car",
          label: "1 piece",
          quantity: 1,
          pricePaise: 30000,
          linePaise: 30000,
          providerId,
          providerName: "Kale Toys",
          providerTown: "Pali",
          billedBy: providerId,
        },
      ],
      address: { name: "Asha Patil", phone: "9000000703", line: "Market Road", areaName: "Nagothane", pin: "402106" },
      slotId: new mongoose.Types.ObjectId(),
      paymentMethod: "cod",
      subtotalPaise: 40000,
      promotionDiscountPaise: 4000,
      deliveryPaise: 3000,
      totalPaise: 39000,
      orderStatus: "completed",
      deliveryStatus: "delivered",
      ...over,
    });
  }

  it("numbers a provider's bills in its own series at delivery, and keeps its details as they were", async () => {
    await setCaConfirmation(owner, true);
    await submitProviderBilling(owner, details());
    const year = financialYear(new Date());
    const numbers: string[] = [];
    for (const number of ["AGS-1", "AGS-2"]) {
      const order = await deliveredOrder(number);
      await mongoose.connection.transaction(async (session) => {
        const bills = await issueProviderBills(order, session);
        order.set("providerBills", bills);
        await order.save({ session });
      });
      numbers.push((await Order.findById(order._id)).providerBills[0].number);
    }
    expect(numbers).toEqual([`KT/${year}/0001`, `KT/${year}/0002`]);
    // a rename later doesn't rewrite a bill already given
    await Provider.updateOne({ _id: providerId }, { $set: { "billing.legalName": "Kale Toys Pvt Ltd" } });
    const kept = await Order.findOne({ number: "AGS-1" });
    expect(kept.providerBills[0].seller).toMatchObject({ legalName: "Kale Toys and Games", gstin: PROVIDER_GSTIN, style: "ledger" });
    // issuing again (a second delivery step) doesn't add a second bill
    await mongoose.connection.transaction(async (session) => {
      expect(await issueProviderBills(kept, session)).toHaveLength(1);
    });
  });

  it("puts a provider's items on Agarwal's bill when its details went missing since the order", async () => {
    const order = await deliveredOrder("AGS-3");
    await mongoose.connection.transaction(async (session) => {
      expect(await issueProviderBills(order, session)).toEqual([]);
    });
    expect(order.items[1].billedBy).toBeUndefined();
  });

  it("gives each bill only its own items, its share of the coupon and the right seller", async () => {
    await setCaConfirmation(owner, true);
    await submitProviderBilling(owner, details({ registration: "composition" }));
    const order = await deliveredOrder("AGS-4", { bill: { issuedAt: new Date(), seller: { legalName: "Agarwal General Stores", gstin: SHOP_GSTIN } } });
    await mongoose.connection.transaction(async (session) => {
      order.set("providerBills", await issueProviderBills(order, session));
      await order.save({ session });
    });
    const agarwal = await orderBillHtml(order, {});
    expect(agarwal?.html).toContain("Long Book");
    expect(agarwal?.html).not.toContain("Toy car");
    // ₹100 of items, ₹10 of the ₹40 coupon, ₹30 delivery
    expect(agarwal?.html).toContain("₹120.00");
    expect(agarwal?.html).toContain("Kale Toys and Games’s items are on its own bill");
    const own = await orderBillHtml(order, { key: providerId });
    expect(own?.number).toMatch(/^KT\//);
    expect(own?.html).toContain("Kale Toys and Games");
    expect(own?.html).toContain(PROVIDER_GSTIN);
    expect(own?.html).toContain("Toy car");
    expect(own?.html).not.toContain("Long Book");
    // ₹300 of items less ₹30 of the coupon; no delivery
    expect(own?.html).toContain("₹270.00");
    expect(own?.html).toContain("Bill of supply");
    expect(own?.html).toContain("Sold through Agarwal Online");
    expect(own?.fileName).toMatch(/^Kale-Toys-and-Games-bill-KT-/);
    // an order's own bills only
    expect(await orderBillHtml(order, { key: String(new mongoose.Types.ObjectId()) })).toBeNull();
  });

  it("makes one view-only bill link per order, and a new one turns the old off", async () => {
    const order = await deliveredOrder("AGS-5");
    const first = await billLink(order, false);
    expect(first).toMatch(/\/b\/[A-Za-z0-9_-]{24}$/);
    expect(await billLink(order, false)).toBe(first);
    const fresh = await billLink(order, true, owner);
    expect(fresh).not.toBe(first);
    expect((await Order.findById(order._id)).billShareToken).toBe(fresh.split("/b/")[1]);
    expect(await AuditLog.exists({ action: "order.bill-link-reset" })).toBeTruthy();
  });
});
