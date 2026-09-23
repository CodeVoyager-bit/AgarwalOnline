import mongoose from "mongoose";
import { getEnv } from "../env";
const globalDB = globalThis as typeof globalThis & {
  mongoPromise?: Promise<typeof mongoose>;
};
export async function connectDB() {
  if (!globalDB.mongoPromise)
    globalDB.mongoPromise = mongoose
      .connect(getEnv().MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
      })
      .catch((error) => {
        globalDB.mongoPromise = undefined;
        throw error;
      });
  return globalDB.mongoPromise;
}
