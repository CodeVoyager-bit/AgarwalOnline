import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { createHmac } from "node:crypto";
import { connectDB } from "../src/lib/db/connect";
import { User, InventoryItem } from "../src/lib/db/models";
import {
  Order,
  DeliverySlot,
  InventoryReservation,
  InventoryMovement,
  OrderTimelineEvent,
} from "../src/lib/commerce/models";
import { Payment, RazorpayWebhookEvent } from "../src/lib/payments/models";
import {
  applyGatewayPayment,
  processWebhook,
  expireReservations,
} from "../src/lib/payments/service";
const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Payment event reconciliation", () => {
  let orderId: string, variantId: string, slotId: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
      MOCK_OTP: "true",
    });
    await connectDB();
    for (const model of [
      User,
      InventoryItem,
      Order,
      DeliverySlot,
      InventoryReservation,
      InventoryMovement,
      OrderTimelineEvent,
      Payment,
      RazorpayWebhookEvent,
    ])
      await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models))
      await model.deleteMany({});
    const user = await User.create({
      phone: "9000000091",
      name: "Fictional customer",
      roles: ["customer"],
    });
    variantId = String(new mongoose.Types.ObjectId());
    const slot = await DeliverySlot.create({
      areaId: new mongoose.Types.ObjectId(),
      date: "2099-01-01",
      label: "10–12",
      capacity: 10,
      reserved: 1,
    });
    slotId = String(slot._id);
    const order = await Order.create({
      customerId: user._id,
      number: "TEST-ONLINE-1",
      idempotencyKey: "online-test",
      items: [
        {
          variantId,
          name: "Rice",
          label: "1kg",
          quantity: 1,
          pricePaise: 10000,
          linePaise: 10000,
        },
      ],
      slotId: slot._id,
      paymentMethod: "razorpay",
      subtotalPaise: 10000,
      deliveryPaise: 0,
      totalPaise: 10000,
      expiresAt: new Date(Date.now() + 900000),
    });
    orderId = String(order._id);
    await InventoryItem.create({ variantId, onHand: 1, reserved: 1 });
    await InventoryReservation.create({
      orderId,
      variantId,
      quantity: 1,
      expiresAt: order.expiresAt,
    });
    await Payment.create({
      orderId,
      providerOrderId: "order_test1",
      amountPaise: 10000,
      state: "pending",
    });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  const entity = (status = "captured") => ({
    id: "pay_test1",
    order_id: "order_test1",
    amount: 10000,
    currency: "INR" as const,
    status,
    captured: status === "captured",
  });
  const event = (id: string) => ({
    id,
    type: "payment.captured",
    payloadHash: "testhash",
  });
  it("processes duplicate captured events once and ignores a later failure", async () => {
    await applyGatewayPayment(entity(), event("evt1"));
    await applyGatewayPayment(entity(), event("evt1"));
    await applyGatewayPayment(entity("failed"), event("evt2"));
    expect((await Order.findById(orderId)).paymentStatus).toBe("paid");
    expect((await Order.findById(orderId)).orderStatus).toBe("placed");
    expect(await RazorpayWebhookEvent.countDocuments()).toBe(2);
    expect(
      await OrderTimelineEvent.countDocuments({ dimension: "payment" }),
    ).toBe(1);
    expect((await InventoryItem.findOne({ variantId })).reserved).toBe(1);
  });
  it("rejects a signed amount mismatch without changing the order", async () => {
    await expect(
      applyGatewayPayment({ ...entity(), amount: 1 }, event("evt1")),
    ).rejects.toThrow("amount");
    expect((await Order.findById(orderId)).paymentStatus).toBe("pending");
    expect(await RazorpayWebhookEvent.countDocuments()).toBe(0);
  });
  it("releases stock on failure and flags later capture for refund", async () => {
    await applyGatewayPayment(entity("failed"), event("evt-failed"));
    expect((await InventoryItem.findOne({ variantId })).reserved).toBe(0);
    expect((await DeliverySlot.findById(slotId)).reserved).toBe(0);
    await applyGatewayPayment(entity(), event("evt-late"));
    expect((await Order.findById(orderId)).orderStatus).toBe("cancelled");
    expect((await Payment.findOne({ orderId })).refundNeeded).toBe(true);
    expect((await Order.findById(orderId)).paymentStatus).toBe("paid");
  });
  it("expires unpaid reservations once, preserving durable release records", async () => {
    await Order.updateOne(
      { _id: orderId },
      { $set: { expiresAt: new Date(0) } },
    );
    expect(await expireReservations()).toBe(1);
    expect(await expireReservations()).toBe(0);
    expect((await InventoryItem.findOne({ variantId })).reserved).toBe(0);
    expect(await InventoryMovement.countDocuments({ kind: "release" })).toBe(1);
  });
  it("requires the webhook signature before parsing or writing", async () => {
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: entity() } },
    });
    await expect(
      processWebhook(raw, "bad", "evt-signed", "secret"),
    ).rejects.toThrow("INVALID_SIGNATURE");
    const signature = createHmac("sha256", "secret").update(raw).digest("hex");
    await processWebhook(raw, signature, "evt-signed", "secret");
    expect((await Order.findById(orderId)).paymentStatus).toBe("paid");
  });
});
