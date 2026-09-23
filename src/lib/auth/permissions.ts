export const roles = ["customer", "delivery", "admin", "super-admin"] as const;
export type Role = (typeof roles)[number];
export const grants = {
  customer: [
    "profile:own",
    "order:own",
    "cart:own",
    "chat:own",
    "complaint:own",
  ],
  delivery: ["profile:own", "delivery:assigned", "cod:collect"],
  admin: [
    "profile:own",
    "catalog:write",
    "inventory:adjust",
    "order:manage",
    "packing:write",
    "delivery:assign",
    "cod:reconcile",
    "chat:support",
    "complaint:manage",
    "approval:request",
    "analytics:read",
    "review:moderate",
  ],
  "super-admin": [
    "profile:own",
    "catalog:write",
    "inventory:adjust",
    "order:manage",
    "packing:write",
    "delivery:assign",
    "cod:reconcile",
    "chat:support",
    "complaint:manage",
    "approval:request",
    "analytics:read",
    "approval:review",
    "settings:write",
    "staff:manage",
    "audit:read",
    "refund:write",
    "promotion:write",
    "review:moderate",
  ],
} as const satisfies Record<Role, readonly string[]>;
export type Permission = (typeof grants)[Role][number];
export function hasPermission(role: Role, permission: Permission) {
  return (grants[role] as readonly string[]).includes(permission);
}
export function assertPermission(role: Role, permission: Permission) {
  if (!hasPermission(role, permission)) throw new Error("FORBIDDEN");
}
