import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import {
  User,
  Category,
  Product,
  ProductVariant,
  InventoryItem,
  ServiceArea,
} from "../src/lib/db/models";
import {
  Address,
  CartLine,
  DeliverySlot,
  InventoryReservation,
  Order,
  Sequence,
  InventoryMovement,
  OrderTimelineEvent,
} from "../src/lib/commerce/models";
import {
  checkout,
  cancelOrder,
  basketFor,
  setCartLine,
} from "../src/lib/commerce/service";
import { Promotion, PromotionRedemption } from "../src/lib/promotions/models";
import { POLICY_VERSION } from "../src/lib/legal/version";
import { Provider } from "../src/lib/providers/models";
import { analytics } from "../src/lib/analytics/service";
const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Transactional COD checkout", () => {
  let customer: string,
    other: string,
    variant: string,
    address: string,
    otherAddress: string,
    slot: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
      MOCK_OTP: "true",
    });
    await connectDB();
    await Promise.all(
      [
        User,
        Category,
        Product,
        ProductVariant,
        InventoryItem,
        ServiceArea,
        Address,
        CartLine,
        DeliverySlot,
        InventoryReservation,
        Order,
        Sequence,
        InventoryMovement,
        OrderTimelineEvent,
      ].map((m) => m.init()),
    );
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models))
      await model.deleteMany({});
    const a = await User.create({
      name: "Test Customer",
      phone: "9000000091",
      roles: ["customer"],
    });
    const b = await User.create({
      name: "Other Customer",
      phone: "9000000092",
      roles: ["customer"],
    });
    customer = String(a._id);
    other = String(b._id);
    const c = await Category.create({
      slug: "staples",
      name: { en: "Staples", mr: "धान्य" },
    });
    const p = await Product.create({
      slug: "rice",
      name: { en: "Rice", mr: "तांदूळ" },
      description: { en: "Rice", mr: "तांदूळ" },
      categoryId: c._id,
      categorySlug: "staples",
      status: "published",
    });
    const v = await ProductVariant.create({
      productId: p._id,
      sku: "TEST",
      label: "1kg",
      unit: "kg",
      packQuantity: 1,
      pricePaise: 10000,
      mrpPaise: 12000,
    });
    variant = String(v._id);
    await InventoryItem.create({ variantId: v._id, onHand: 1, reserved: 0 });
    const area = await ServiceArea.create({
      key: "fictional",
      name: "Fictional test zone",
      pincodes: ["999999"],
      enabled: true,
      feePaise: 3000,
    });
    const addr = await Address.create({
      customerId: customer,
      name: "Test",
      phone: "9000000091",
      line: "Fictional address only",
      pin: "999999",
      areaId: area._id,
    });
    address = String(addr._id);
    const addr2 = await Address.create({
      customerId: other,
      name: "Other",
      phone: "9000000092",
      line: "Other fictional address",
      pin: "999999",
      areaId: area._id,
    });
    otherAddress = String(addr2._id);
    const sl = await DeliverySlot.create({
      areaId: area._id,
      date: "2099-01-01",
      label: "10–12",
      capacity: 5,
    });
    slot = String(sl._id);
    await CartLine.create([
      { customerId: customer, variantId: variant, quantity: 1 },
      { customerId: other, variantId: variant, quantity: 1 },
    ]);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  const input = () => ({
    addressId: address,
    slotId: slot,
    idempotencyKey: randomUUID(),
    method: "cod",
    termsVersion: POLICY_VERSION,
  });
  it("keeps who provided each line, as it was when ordered, and totals delivered sales by provider", async () => {
    const provider = await Provider.create({
      name: "Sharma Stationers",
      town: "Roha",
      slug: "sharma-stationers-roha",
      status: "active",
      createdBy: customer,
    });
    await Product.updateOne({ slug: "rice" }, { $set: { providerId: provider._id } });
    const id = await checkout(customer, input());
    // a rename later doesn't rewrite the order
    await Provider.updateOne({ _id: provider._id }, { $set: { name: "Sharma Books" } });
    const o = await Order.findById(id);
    expect(o.items[0]).toMatchObject({ providerName: "Sharma Stationers", providerTown: "Roha" });
    expect(String(o.items[0].providerId)).toBe(String(provider._id));
    const staff = await User.create({ name: "Staff", phone: "9000000079", roles: ["customer", "admin"] });
    expect((await analytics(String(staff._id), {})).providers).toEqual([]);
    // delivered by someone: every real delivery has a partner
    await Order.updateOne({ _id: id }, { $set: { deliveryStatus: "delivered", assignedTo: staff._id } });
    expect((await analytics(String(staff._id), {})).providers).toEqual([
      { name: "Sharma Stationers, Roha", quantity: o.items[0].quantity, revenuePaise: o.items[0].linePaise },
    ]);
  });
  it("shows analytics even for a delivered order with no rider recorded", async () => {
    const id = await checkout(customer, input());
    await Order.updateOne({ _id: id }, { $set: { deliveryStatus: "delivered" }, $unset: { assignedTo: 1 } });
    const staff = await User.create({ name: "Staff", phone: "9000000080", roles: ["customer", "admin"] });
    const report = await analytics(String(staff._id), {});
    expect(report.metrics.orders).toBeGreaterThan(0);
  });
  it("records who bills a line: a provider set to bill in its own name, else Agarwal", async () => {
    const provider = await Provider.create({
      name: "Kale Toys",
      town: "Pali",
      slug: "kale-toys-pali",
      status: "active",
      createdBy: customer,
      billing: { ownBills: true, legalName: "Kale Toys and Games" },
    });
    await Product.updateOne({ slug: "rice" }, { $set: { providerId: provider._id } });
    const own = await Order.findById(await checkout(customer, input()));
    expect(String(own.items[0].billedBy)).toBe(String(provider._id));
    // switched back to Agarwal: the next order's line is Agarwal's, the first keeps its own
    await Provider.updateOne({ _id: provider._id }, { $set: { "billing.ownBills": false } });
    await InventoryItem.updateOne({ variantId: variant }, { $set: { onHand: 5 } });
    await CartLine.create({ customerId: customer, variantId: variant, quantity: 1 });
    const next = await Order.findById(await checkout(customer, input()));
    expect(next.items[0].billedBy).toBeUndefined();
    expect(String((await Order.findById(own._id)).items[0].billedBy)).toBe(String(provider._id));
  });
  it("doesn't name a provider an owner hasn't approved yet", async () => {
    const provider = await Provider.create({ name: "Kale Toys", town: "Pali", slug: "kale-toys-pali", status: "pending", createdBy: customer });
    await Product.updateOne({ slug: "rice" }, { $set: { providerId: provider._id } });
    const o = await Order.findById(await checkout(customer, input()));
    expect(o.items[0].providerName).toBeUndefined();
  });
  it("snapshots server prices, reserves stock and retries idempotently", async () => {
    const data = input();
    const id = await checkout(customer, data);
    const retry = await checkout(customer, data);
    expect(retry).toBe(id);
    expect(await Order.countDocuments()).toBe(1);
    const o = await Order.findById(id);
    expect(o.totalPaise).toBe(13000);
    // the Terms the customer ticked at checkout stay with the order
    expect(o.termsVersion).toBe(POLICY_VERSION);
    expect(o.termsAcceptedAt).toBeInstanceOf(Date);
    expect((await InventoryItem.findOne({ variantId: variant })).reserved).toBe(
      1,
    );
    expect(await CartLine.countDocuments({ customerId: customer })).toBe(0);
  });
  it("refuses an order without the current Terms ticked, and holds no stock", async () => {
    const unticked: Partial<ReturnType<typeof input>> = input();
    delete unticked.termsVersion;
    await expect(checkout(customer, unticked)).rejects.toThrow("Terms were updated");
    // a checkout page left open from before the Terms changed
    await expect(checkout(customer, { ...input(), termsVersion: "2000-01-01" })).rejects.toThrow(
      "Terms were updated",
    );
    expect(await Order.countDocuments()).toBe(0);
    expect((await InventoryItem.findOne({ variantId: variant })).reserved).toBe(0);
  });
  it("rejects client-supplied totals", async () => {
    await expect(
      checkout(customer, { ...input(), totalPaise: 1 }),
    ).rejects.toThrow();
    expect(await Order.countDocuments()).toBe(0);
  });
  it("prevents overselling across concurrent customers", async () => {
    const results = await Promise.allSettled([
      checkout(customer, input()),
      checkout(other, { ...input(), addressId: otherAddress }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await Order.countDocuments()).toBe(1);
    expect((await InventoryItem.findOne({ variantId: variant })).reserved).toBe(
      1,
    );
  });
  it("enforces address ownership and rolls back a full slot", async () => {
    await expect(checkout(other, input())).rejects.toThrow("address");
    await DeliverySlot.updateOne({ _id: slot }, { $set: { reserved: 5 } });
    await expect(checkout(customer, input())).rejects.toThrow("full");
    expect((await InventoryItem.findOne({ variantId: variant })).reserved).toBe(
      0,
    );
    expect(await Order.countDocuments()).toBe(0);
  });
  it("shows a product taken off the shop in the basket, names it at checkout and lets it be removed", async () => {
    await Product.updateOne({ slug: "rice" }, { $set: { status: "draft" } });
    const basket = await basketFor(customer);
    expect(basket.lines).toHaveLength(0);
    expect(basket.unavailable).toEqual([
      expect.objectContaining({ variantId: variant, name: "Rice", label: "1kg" }),
    ]);
    await expect(checkout(customer, input())).rejects.toThrow(
      "Your basket has Rice, which is no longer sold",
    );
    await setCartLine(customer, variant, 0);
    expect((await basketFor(customer)).unavailable).toHaveLength(0);
    expect(await Order.countDocuments()).toBe(0);
  });
  it("says how many are left when the basket holds more than the stock", async () => {
    await CartLine.updateOne({ customerId: customer }, { $set: { quantity: 3 } });
    await expect(checkout(customer, input())).rejects.toThrow(
      "Your basket has 3 of Rice, but only 1 is left",
    );
    await InventoryItem.updateOne({ variantId: variant }, { $set: { onHand: 0 } });
    await expect(checkout(customer, input())).rejects.toThrow(
      "Your basket has Rice, which is sold out",
    );
    expect((await InventoryItem.findOne({ variantId: variant })).reserved).toBe(0);
  });
  it("gives a once-per-customer offer back when the order is cancelled", async () => {
    await Promotion.create({
      name: "Welcome",
      code: "HELLO10",
      kind: "code",
      discountType: "percentage",
      discountValue: 10,
      minimumSubtotalPaise: 0,
      startsAt: new Date(Date.now() - 86400000),
      endsAt: new Date(Date.now() + 86400000),
      perCustomerLimit: 1,
      active: true,
      createdBy: customer,
      updatedBy: customer,
    });
    const id = await checkout(customer, { ...input(), promotionCode: "HELLO10" });
    expect((await Order.findById(id)).promotionDiscountPaise).toBe(1000);
    // the offer's terms stay with the order, so packing works it out the same way if the owner edits it later
    expect((await Order.findById(id).lean()).appliedPromotion).toMatchObject({
      code: "HELLO10",
      discountPaise: 1000,
      discountType: "percentage",
      discountValue: 10,
    });
    expect(await PromotionRedemption.countDocuments()).toBe(1);
    await cancelOrder(customer, id);
    expect(await PromotionRedemption.countDocuments()).toBe(0);
    expect((await Promotion.findOne({ code: "HELLO10" })).redemptionCount).toBe(0);
  });
  it("releases inventory and capacity exactly once on cancellation", async () => {
    const id = await checkout(customer, input());
    await expect(cancelOrder(other, id)).rejects.toThrow();
    await cancelOrder(customer, id);
    await expect(cancelOrder(customer, id)).rejects.toThrow();
    expect((await InventoryItem.findOne({ variantId: variant })).reserved).toBe(
      0,
    );
    expect((await DeliverySlot.findById(slot)).reserved).toBe(0);
    expect((await Order.findById(id)).orderStatus).toBe("cancelled");
  });
});
