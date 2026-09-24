// One-time migration: users used to hold a single `role`; they now hold `roles`, and everyone is a customer.
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
await connectDB();
const result = await mongoose.connection.collection("users").updateMany(
  { roles: { $exists: false } },
  [
    {
      $set: {
        roles: {
          $cond: [
            { $in: ["$role", ["delivery", "admin", "super-admin"]] },
            ["customer", "$role"],
            ["customer"],
          ],
        },
      },
    },
    { $unset: "role" },
  ],
);
console.log(
  `Database "${mongoose.connection.name}": ${result.modifiedCount} user(s) migrated to roles.`,
);
await mongoose.disconnect();
