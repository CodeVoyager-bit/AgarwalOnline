import mongoose from "mongoose";
import { z } from "zod";
import {
  assertPermission,
  rolesFor,
  staffRoleOf,
  staffRoles,
  type Role,
} from "../auth/permissions";
import { connectDB } from "../db/connect";
import { AuditLog, User } from "../db/models";
import { objectId } from "../commerce/service";
import {
  hashStaffPassword,
  revokeStaffSessions,
  setStaffCredential,
} from "../auth/staff-credentials";

async function authorize(actorId: string) {
  await connectDB();
  const actor = await User.findOne({
    _id: objectId.parse(actorId),
    active: true,
  });
  if (!actor) throw Error("UNAUTHENTICATED");
  assertPermission(actor.roles as Role[], "staff:manage");
}

const name = z.string().trim().min(2).max(80);
const email = z.string().trim().toLowerCase().email().max(180);
const phone = z.string().regex(/^\d{10}$/, "Enter a 10-digit phone number.");
const password = z.string().min(8).max(128);
/** Blank form fields arrive as "" and mean "not provided". */
const blank = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .union([z.literal(""), schema])
    .transform((value) => (value === "" ? undefined : value) as z.output<T> | undefined);

/** Gives the account on this phone number a staff role, creating the account if nobody has it yet. */
export async function createStaff(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z
    .object({
      phone,
      role: z.enum(staffRoles),
      name: blank(name),
      email: blank(email),
      password: blank(password),
    })
    .parse(input);
  const passwordHash = data.password
    ? await hashStaffPassword(data.password)
    : undefined;
  let created = false;
  await mongoose.connection.transaction(async (session) => {
    const existing = await User.findOne({ phone: data.phone }).session(session);
    if (existing) {
      const previousRole = staffRoleOf(existing.roles as Role[]);
      existing.roles = rolesFor(data.role);
      if (data.name) existing.name = data.name;
      if (data.email) {
        existing.email = data.email;
        existing.emailVerified = true;
      }
      await existing.save({ session });
      if (passwordHash)
        await setStaffCredential(String(existing._id), passwordHash, session);
      // staff sessions are shorter, so the person signs in again under the new rules
      await revokeStaffSessions(String(existing._id), session);
      await AuditLog.create(
        [
          {
            actorId,
            action: "staff.grant",
            target: String(existing._id),
            details: {
              phone: data.phone,
              email: existing.email,
              role: data.role,
              previousRole,
              passwordReset: Boolean(passwordHash),
            },
          },
        ],
        { session },
      );
      return;
    }
    if (!data.name || !data.email || !passwordHash)
      throw Error(
        "Name, work email and a temporary password are needed to create a new account.",
      );
    created = true;
    const [staff] = await User.create(
      [
        {
          name: data.name,
          email: data.email,
          phone: data.phone,
          roles: rolesFor(data.role),
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
  return { created };
}

/** Edits a staff member; role "customer" removes staff access and leaves an ordinary customer account. */
export async function updateStaff(actorId: string, input: unknown) {
  await authorize(actorId);
  const data = z
    .object({
      staffId: objectId,
      name,
      email,
      phone,
      role: z.enum([...staffRoles, "customer"]),
      active: z.boolean(),
      password: z.union([password, z.literal("")]),
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
      roles: { $in: staffRoles },
    }).session(session);
    if (!staff) throw Error("Staff account not found.");
    const currentRole = staffRoleOf(staff.roles as Role[]);
    const nextRole = data.role === "customer" ? null : data.role;
    if (
      currentRole === "super-admin" &&
      staff.active &&
      (nextRole !== "super-admin" || !data.active)
    ) {
      const remaining = await User.countDocuments({
        roles: "super-admin",
        active: true,
        _id: { $ne: staff._id },
      }).session(session);
      if (!remaining) throw Error("Keep at least one active Super Admin.");
    }
    const before = {
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      role: currentRole,
      active: staff.active,
    };
    staff.name = data.name;
    staff.email = data.email;
    staff.phone = data.phone;
    staff.roles = rolesFor(nextRole);
    staff.active = data.active;
    await staff.save({ session });
    if (passwordHash)
      await setStaffCredential(String(staff._id), passwordHash, session);
    const roleChanged = before.role !== nextRole;
    if (!data.active || passwordHash || roleChanged)
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
              role: nextRole,
              active: data.active,
            },
            passwordReset: Boolean(passwordHash),
            sessionsRevoked: !data.active || Boolean(passwordHash) || roleChanged,
          },
        },
      ],
      { session },
    );
  });
}
