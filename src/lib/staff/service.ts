import mongoose from "mongoose";
import { z } from "zod";
import { assertPermission, type Role } from "../auth/permissions";
import { connectDB } from "../db/connect";
import { AuditLog, User } from "../db/models";
import { objectId } from "../commerce/service";
import {
  hashStaffPassword,
  revokeStaffSessions,
  setStaffCredential,
} from "../auth/staff-credentials";

const staffRoles = ["delivery", "admin", "super-admin"] as const;

async function authorize(actorId: string) {
  await connectDB();
  const actor = await User.findOne({
    _id: objectId.parse(actorId),
    active: true,
  });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.role as Role, "staff:manage");
}

const base = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(180),
  phone: z.string().regex(/^\d{10}$/, "Enter a 10-digit phone number."),
  role: z.enum(staffRoles),
});

export async function createStaff(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = base
    .extend({ password: z.string().min(8).max(128) })
    .parse(input);
  const passwordHash = await hashStaffPassword(data.password);
  await mongoose.connection.transaction(async (session) => {
    const [staff] = await User.create(
      [
        {
          name: data.name,
          email: data.email,
          phone: data.phone,
          role: data.role,
          emailVerified: true,
          active: true,
        },
      ],
      { session },
    );
    await setStaffCredential(String(staff._id), passwordHash, session);
    await AuditLog.create(
      [
        {
          actorId,
          action: "staff.create",
          target: String(staff._id),
          details: {
            name: data.name,
            email: data.email,
            phone: data.phone,
            role: data.role,
          },
        },
      ],
      { session },
    );
  });
}

export async function updateStaff(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = base
    .extend({
      staffId: objectId,
      active: z.boolean(),
      password: z.union([z.string().min(8).max(128), z.literal("")]),
    })
    .parse(input);
  if (data.staffId === actorId)
    throw Error("Manage your own account through a separate verified flow.");
  const passwordHash = data.password
    ? await hashStaffPassword(data.password)
    : undefined;
  await mongoose.connection.transaction(async (session) => {
    const staff = await User.findOne({
      _id: data.staffId,
      role: { $in: staffRoles },
    }).session(session);
    if (!staff) throw Error("Staff account not found.");
    if (
      staff.role === "super-admin" &&
      staff.active &&
      (data.role !== "super-admin" || !data.active)
    ) {
      const remaining = await User.countDocuments({
        role: "super-admin",
        active: true,
        _id: { $ne: staff._id },
      }).session(session);
      if (!remaining) throw Error("Keep at least one active Super Admin.");
    }
    const before = {
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      role: staff.role,
      active: staff.active,
    };
    staff.name = data.name;
    staff.email = data.email;
    staff.phone = data.phone;
    staff.role = data.role;
    staff.active = data.active;
    await staff.save({ session });
    if (passwordHash)
      await setStaffCredential(String(staff._id), passwordHash, session);
    if (!data.active || passwordHash || before.role !== data.role)
      await revokeStaffSessions(String(staff._id), session);
    await AuditLog.create(
      [
        {
          actorId,
          action: "staff.update",
          target: String(staff._id),
          details: {
            before,
            after: {
              name: data.name,
              email: data.email,
              phone: data.phone,
              role: data.role,
              active: data.active,
            },
            passwordReset: Boolean(passwordHash),
            sessionsRevoked:
              !data.active ||
              Boolean(passwordHash) ||
              before.role !== data.role,
          },
        },
      ],
      { session },
    );
  });
}
