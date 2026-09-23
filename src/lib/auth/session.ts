import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connectDB } from "../db/connect";
import { User } from "../db/models";
import { assertPermission, type Permission, type Role } from "./permissions";
import { getAuth } from "./better-auth";
export type Identity = { id: string; name: string; phone: string; role: Role };
export async function currentUser(): Promise<Identity | null> {
  await connectDB();
  const authSession = await getAuth().api.getSession({
    headers: await headers(),
  });
  if (!authSession) return null;
  const user = await User.findOne({ _id: authSession.user.id, active: true });
  return user
    ? {
        id: String(user._id),
        name: user.name,
        phone: user.phone,
        role: user.role,
      }
    : null;
}
export async function requirePermission(permission: Permission) {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  assertPermission(user.role, permission);
  return user;
}
export async function requirePage(permission: Permission) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!(await import("./permissions")).hasPermission(user.role, permission))
    redirect("/forbidden");
  return user;
}
