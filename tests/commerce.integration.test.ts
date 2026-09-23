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
import { checkout, cancelOrder } from "../src/lib/commerce/service";
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
      role: "customer",
    });
    const b = await User.create({
      name: "Other Customer",
      phone: "9000000092",
      role: "customer",
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
  });
  it("snapshots server prices, reserves stock and retries idempotently", async () => {
    const data = input();
    const id = await checkout(customer, data);
    const retry = await checkout(customer, data);
    expect(retry).toBe(id);
    expect(await Order.countDocuments()).toBe(1);
    const o = await Order.findById(id);
    expect(o.totalPaise).toBe(13000);
    expect((await InventoryItem.findOne({ variantId: variant })).reserved).toBe(
      1,
    );
    expect(await CartLine.countDocuments({ customerId: customer })).toBe(0);
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
