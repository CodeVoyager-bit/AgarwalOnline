import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditLog, User } from "../src/lib/db/models";
import { connectDB } from "../src/lib/db/connect";
import { createStaff, updateStaff } from "../src/lib/staff/service";
import { getAuth } from "../src/lib/auth/better-auth";

const uri = process.env.TEST_MONGODB_URI;

describe.skipIf(!uri)("Staff access management", () => {
  let superAdminId: string;

  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, {
      MONGODB_URI: uri,
      APP_ORIGIN: "http://127.0.0.1:3000",
      AUTH_SECRET: "test-secret-".repeat(4),
    });
    await connectDB();
    await Promise.all([User.init(), AuditLog.init()]);
  });

  beforeEach(async () => {
    for (const model of Object.values(mongoose.models))
      await model.deleteMany({});
    await mongoose.connection.collection("authAccounts").deleteMany({});
    await mongoose.connection.collection("authSessions").deleteMany({});
    superAdminId = String(
      (
        await User.create({
          name: "Store owner",
          email: "owner@example.test",
          phone: "9000000071",
          role: "super-admin",
        })
      )._id,
    );
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("creates a sign-in-ready account without storing the plain password", async () => {
    await createStaff(superAdminId, {
      name: "Ops Admin",
      email: "ops@example.test",
      phone: "9000000072",
      role: "admin",
      password: "temporary-pass-123",
    });

    const staff = await User.findOne({ phone: "9000000072" }).select(
      "+passwordHash",
    );
    expect(staff?.active).toBe(true);
    expect(staff?.passwordHash).toBeUndefined();
    const credential = await mongoose.connection
      .collection("authAccounts")
      .findOne({ userId: staff!._id, providerId: "credential" });
    expect(
      await bcrypt.compare("temporary-pass-123", String(credential?.password)),
    ).toBe(true);
    expect(staff?.toObject()).not.toHaveProperty("password");
    const signedIn = await getAuth().api.signInEmail({
      body: {
        email: "ops@example.test",
        password: "temporary-pass-123",
      },
      headers: new Headers({ origin: "http://127.0.0.1:3000" }),
    });
    expect(signedIn.user.role).toBe("admin");
    const audit = await AuditLog.findOne({ action: "staff.create" }).lean();
    expect(audit?.details).not.toHaveProperty("password");
  });

  it("revokes sessions when role access changes", async () => {
    const staff = await User.create({
      name: "Ops Admin",
      email: "ops@example.test",
      phone: "9000000072",
      role: "admin",
    });
    await mongoose.connection.collection("authSessions").insertOne({
      userId: staff._id,
      token: "role-change-token",
      expiresAt: new Date("2099-01-01"),
      ipAddress: "127.0.0.1",
      userAgent: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await updateStaff(superAdminId, {
      staffId: String(staff._id),
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      role: "delivery",
      active: true,
      password: "",
    });

    expect(
      await mongoose.connection
        .collection("authSessions")
        .countDocuments({ userId: staff._id }),
    ).toBe(0);
    expect((await User.findById(staff._id))?.role).toBe("delivery");
    expect(
      (await AuditLog.findOne({ action: "staff.update" }).lean())?.details,
    ).toMatchObject({ sessionsRevoked: true });
  });

  it("allows only Super Admins to manage staff", async () => {
    const admin = await User.create({
      name: "Regular Admin",
      email: "admin@example.test",
      phone: "9000000073",
      role: "admin",
    });
    await expect(
      createStaff(String(admin._id), {
        name: "Delivery Partner",
        email: "delivery@example.test",
        phone: "9000000074",
        role: "delivery",
        password: "temporary-pass-123",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("protects the signed-in Super Admin from self lockout", async () => {
    const owner = await User.findById(superAdminId);
    const input = {
      staffId: superAdminId,
      name: owner!.name,
      email: owner!.email,
      phone: owner!.phone,
      role: "admin",
      active: false,
      password: "",
    };
    await expect(updateStaff(superAdminId, input)).rejects.toThrow(
      "own account",
    );
  });
});
