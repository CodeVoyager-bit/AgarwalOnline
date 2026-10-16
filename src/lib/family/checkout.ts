import type { ClientSession } from "mongoose";
import { User } from "../db/models";
import { Family } from "./models";

const PICK = "Select who this order is for.";

/**
 * What an order carries into Family spend, decided inside the checkout transaction.
 * `private` keeps it out; empty means the whole family; otherwise an adult's or a child's id.
 * Only models are imported here, so the commerce service can call it without a cycle.
 */
export async function orderFamily(customerId: string, forId: string | undefined, session: ClientSession) {
  if (forId === "private") return {};
  const family = await Family.findOne({ adults: customerId }).session(session);
  if (!family) {
    if (forId) throw Error(PICK);
    return {};
  }
  if (!forId) return { familyId: family._id };
  const child = family.children.find((c: { _id: unknown }) => String(c._id) === forId);
  if (child) return { familyId: family._id, forPerson: { personId: child._id, name: child.name, child: true } };
  if (!family.adults.some((a: unknown) => String(a) === forId)) throw Error(PICK);
  const person = await User.findById(forId).select("name").session(session);
  const name = person?.name?.trim().split(/\s+/)[0] || "Someone";
  return { familyId: family._id, forPerson: { personId: person?._id ?? forId, name, child: false } };
}
