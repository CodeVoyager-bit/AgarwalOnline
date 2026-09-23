import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { User } from "../src/lib/db/models";
import { Order } from "../src/lib/commerce/models";
import { Complaint, ReturnRequest } from "../src/lib/aftercare/models";
import {
  createComplaint,
  resolveComplaint,
  updateReturn,
} from "../src/lib/aftercare/service";
const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Complaints and returns", () => {
  let customer: string, other: string, admin: string, orderId: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
    for (const m of [User, Order, Complaint, ReturnRequest]) await m.init();
  });
  beforeEach(async () => {
    for (const m of Object.values(mongoose.models)) await m.deleteMany({});
    const users = await User.create([
      { name: "Test user", phone: "9000000071", role: "customer" },
      { name: "Test user", phone: "9000000072", role: "customer" },
      { name: "Test user", phone: "9000000073", role: "admin" },
    ]);
    [customer, other, admin] = users.map((u: { _id: unknown }) =>
      String(u._id),
    );
    orderId = String(
      (
        await Order.create({
          customerId: customer,
          number: "AFTERCARE-1",
          idempotencyKey: "aftercare",
          items: [],
          address: {},
          slotId: new mongoose.Types.ObjectId(),
          paymentMethod: "cod",
          subtotalPaise: 10000,
          deliveryPaise: 0,
          totalPaise: 10000,
        })
      )._id,
    );
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  const complaint = () => ({
    orderId,
    type: "damaged-item",
    description: "The rice packet arrived damaged",
    requestReturn: true,
  });
  it("enforces order ownership and delivery before item returns", async () => {
    await expect(createComplaint(other, complaint())).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(createComplaint(customer, complaint())).rejects.toThrow(
      "after delivery",
    );
    expect(await Complaint.countDocuments()).toBe(0);
    await Order.updateOne({ _id: orderId }, { deliveryStatus: "delivered" });
    await createComplaint(customer, complaint());
    expect(await Complaint.countDocuments({ customerId: customer })).toBe(1);
    expect(await ReturnRequest.countDocuments({ orderId })).toBe(1);
  });
  it("requires staff authorization and preserves the return sequence", async () => {
    await Order.updateOne({ _id: orderId }, { deliveryStatus: "delivered" });
    await createComplaint(customer, complaint());
    const c = await Complaint.findOne({});
    const r = await ReturnRequest.findOne({});
    await expect(
      resolveComplaint(customer, {
        complaintId: String(c._id),
        status: "resolved",
        resolution: "Checked packet",
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      updateReturn(admin, {
        returnId: String(r._id),
        status: "received",
        notes: "Checked packet",
      }),
    ).rejects.toThrow("not allowed");
    await updateReturn(admin, {
      returnId: String(r._id),
      status: "approved",
      notes: "Return approved",
    });
    await expect(
      updateReturn(admin, {
        returnId: String(r._id),
        status: "pickup-scheduled",
        notes: "Arrange pickup",
      }),
    ).rejects.toThrow("pickup date");
    for (const status of [
      "pickup-scheduled",
      "picked-up",
      "received",
      "closed",
    ])
      await updateReturn(admin, {
        returnId: String(r._id),
        status,
        pickupDate: "2099-01-01",
        notes: "Packet checked",
      });
    await resolveComplaint(admin, {
      complaintId: String(c._id),
      status: "resolved",
      resolution: "Return received and inspected",
    });
    await expect(
      resolveComplaint(admin, {
        complaintId: String(c._id),
        status: "rejected",
        resolution: "Changed resolution",
      }),
    ).rejects.toThrow("closed");
    expect((await ReturnRequest.findById(r._id)).status).toBe("closed");
  });
});
