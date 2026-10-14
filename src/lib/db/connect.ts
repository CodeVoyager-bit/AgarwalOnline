import mongoose from "mongoose";
import { getEnv } from "../env";
import { log } from "../logger";
type MongoClient = InstanceType<typeof mongoose.mongo.MongoClient>;
const globalDB = globalThis as typeof globalThis & {
  mongoPromise?: Promise<typeof mongoose>;
  mongoClients?: Map<string, MongoClient>;
};

/**
 * The one MongoClient per server process and database address. Mongoose and better-auth share
 * it, so each copy of the app holds one pool to Atlas instead of two (the free cluster allows 500
 * connections in all, and every Vercel instance is a copy). It lives on globalThis so a dev
 * hot reload reuses it instead of leaking a new one.
 */
export function mongoClient(uri = getEnv().MONGODB_URI): MongoClient {
  globalDB.mongoClients ??= new Map();
  let client = globalDB.mongoClients.get(uri);
  if (!client) {
    // Mongoose's own driver class: `setClient` only accepts that one
    client = new mongoose.mongo.MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
      // each new connection to Atlas is a full secure handshake, so one is kept warm per server
      // (src/instrumentation.ts opens it at start); the rest open in parallel when a page needs
      // them and close after a minute idle, instead of four per server held open forever
      minPoolSize: 1,
      maxConnecting: 4,
      maxIdleTimeMS: 60_000,
    });
    globalDB.mongoClients.set(uri, client);
  }
  return client;
}

/**
 * better-auth keeps its sessions, accounts, codes and rate limits in collections of its own, not
 * Mongoose models, so nothing built their indexes: every signed-in page scanned all sessions to
 * find its own. Built once per server start, like Mongoose's; an index that exists costs nothing.
 */
function authIndexes(db: ReturnType<MongoClient["db"]>) {
  return Promise.all([
    // unique, as better-auth builds it too: asking for a plain one under the same name fails
    db.collection("authSessions").createIndex({ token: 1 }, { unique: true }),
    db.collection("authSessions").createIndex({ userId: 1 }),
    db.collection("authAccounts").createIndex({ userId: 1 }),
    db.collection("authAccounts").createIndex({ providerId: 1, accountId: 1 }),
    db.collection("authVerifications").createIndex({ identifier: 1 }),
    db.collection("authRateLimits").createIndex({ key: 1 }),
  ]);
}

export async function connectDB() {
  if (!globalDB.mongoPromise)
    globalDB.mongoPromise = (async () => {
      // a test or script that connected Mongoose its own way keeps that connection
      if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) return mongoose;
      const client = mongoClient();
      await client.connect();
      mongoose.connection.setClient(client);
      void authIndexes(client.db()).catch((error) => log("warn", "db.auth-indexes-failed", { error }));
      return mongoose;
    })().catch((error) => {
      globalDB.mongoPromise = undefined;
      throw error;
    });
  return globalDB.mongoPromise;
}
