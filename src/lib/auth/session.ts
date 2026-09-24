import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connectDB } from "../db/connect";
import { User } from "../db/models";
import { assertPermission, hasPermission, type Permission, type Role } from "./permissions";
import { sessionUserId } from "./better-auth";
export type Identity = { id: string; name: string; phone: string; roles: Role[] };
export async function currentUser(): Promise<Identity | null> {
  await connectDB();
  const userId = await sessionUserId(await headers());
  if (!userId) return null;
  const user = await User.findOne({ _id: userId, active: true });
  return user
    ? {
        id: String(user._id),
        name: user.name,
        phone: user.phone,
        roles: user.roles as Role[],
      }
    : null;
}
export async function requirePermission(permission: Permission) {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  assertPermission(user.roles, permission);
  return user;
}
export async function requirePage(permission: Permission) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.roles, permission))
    redirect("/forbidden");
  return user;
}
