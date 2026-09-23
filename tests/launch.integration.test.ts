import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectDB } from "../src/lib/db/connect";
import {
  AuditLog,
  Category,
  InventoryItem,
  Product,
  ProductVariant,
  User,
} from "../src/lib/db/models";
import { CartLine, Order } from "../src/lib/commerce/models";
import { Notification, WishlistItem } from "../src/lib/engagement/models";
import { Refund } from "../src/lib/payments/models";
import { toggleWishlist } from "../src/lib/engagement/service";
import { reorder } from "../src/lib/commerce/service";
import { createRefund, processRefund } from "../src/lib/payments/service";

const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("Launch customer and refund workflows", () => {
  let customerId: string;
  let ownerId: string;
  let variantId: string;

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
    await Promise.all([
      User.init(),
      Product.init(),
      ProductVariant.init(),
      InventoryItem.init(),
      Order.init(),
      WishlistItem.init(),
      Notification.init(),
      Refund.init(),
    ]);
  });

  beforeEach(async () => {
    for (const model of Object.values(mongoose.models))
      await model.deleteMany({});
    const [customer, owner] = await User.create([
      { name: "Customer", phone: "9000000061", role: "customer" },
      {
        name: "Owner",
        phone: "9000000062",
        email: "owner@launch.test",
        role: "super-admin",
      },
    ]);
    customerId = String(customer._id);
    ownerId = String(owner._id);
    const category = await Category.create({
      slug: "launch",
      name: { en: "Launch", mr: "लाँच" },
    });
    const product = await Product.create({
      slug: "launch-rice",
      name: { en: "Launch Rice", mr: "तांदूळ" },
      description: { en: "Launch test rice", mr: "चाचणी तांदूळ" },
      categoryId: category._id,
      categorySlug: category.slug,
      status: "published",
    });
    const variant = await ProductVariant.create({
      productId: product._id,
      sku: "LAUNCH-RICE",
      label: "1 kg",
      unit: "kg",
      packQuantity: 1,
      pricePaise: 10000,
      mrpPaise: 12000,
      maxQuantity: 5,
    });
    variantId = String(variant._id);
    await InventoryItem.create({ variantId: variant._id, onHand: 10 });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("saves and removes only published products from a customer wishlist", async () => {
    expect(
      await toggleWishlist(customerId, (await Product.findOne())!._id),
    ).toBe(true);
    expect(await WishlistItem.countDocuments({ customerId })).toBe(1);
    expect(
      await toggleWishlist(customerId, (await Product.findOne())!._id),
    ).toBe(false);
    expect(await WishlistItem.countDocuments({ customerId })).toBe(0);
  });

  it("reorders available owned items into the basket", async () => {
    const order = await Order.create({
      customerId,
      number: "AGS-LAUNCH-001",
      idempotencyKey: "launch-order-1",
      items: [
        {
          variantId,
          name: "Launch Rice",
          label: "1 kg",
          quantity: 2,
          pricePaise: 10000,
          linePaise: 20000,
        },
      ],
      slotId: new mongoose.Types.ObjectId(),
      subtotalPaise: 20000,
      deliveryPaise: 0,
      totalPaise: 20000,
      paymentMethod: "cod",
      paymentStatus: "paid",
      orderStatus: "completed",
      deliveryStatus: "delivered",
    });
    await reorder(customerId, String(order._id));
    expect((await CartLine.findOne({ customerId, variantId }))?.quantity).toBe(
      2,
    );
    const stranger = await User.create({
      name: "Stranger",
      phone: "9000000063",
      role: "customer",
    });
    await expect(
      reorder(String(stranger._id), String(order._id)),
    ).rejects.toThrow("unavailable");
  });

  it("tracks a partial manual refund and prevents over-refunding", async () => {
    const order = await Order.create({
      customerId,
      number: "AGS-LAUNCH-002",
      idempotencyKey: "launch-order-2",
      items: [
        {
          variantId,
          name: "Launch Rice",
          label: "1 kg",
          quantity: 2,
          pricePaise: 10000,
          linePaise: 20000,
        },
      ],
      slotId: new mongoose.Types.ObjectId(),
      subtotalPaise: 20000,
      deliveryPaise: 0,
      totalPaise: 20000,
      paymentMethod: "cod",
      paymentStatus: "paid",
      orderStatus: "completed",
      deliveryStatus: "delivered",
    });
    const refundId = await createRefund(ownerId, {
      orderId: String(order._id),
      amountPaise: 5000,
      reason: "Damaged item resolution",
    });
    await processRefund(ownerId, { refundId, externalReference: "CASH-001" });
    expect((await Refund.findById(refundId))?.status).toBe("processed");
    expect((await Order.findById(order._id))?.paymentStatus).toBe(
      "partially-refunded",
    );
    expect(
      await Notification.countDocuments({ userId: customerId, type: "refund" }),
    ).toBe(2);
    expect(await AuditLog.countDocuments({ target: refundId })).toBe(2);
    await expect(
      createRefund(ownerId, {
        orderId: String(order._id),
        amountPaise: 16000,
        reason: "Too much refund",
      }),
    ).rejects.toThrow("exceeds");
  });
});
