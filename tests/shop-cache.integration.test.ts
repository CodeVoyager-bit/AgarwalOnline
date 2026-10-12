import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import mongoose, { Schema } from "mongoose";
const uri = process.env.TEST_MONGODB_URI;
const schema = new Schema({ n: Number });
const probe = () => mongoose.model("ShopCacheProbe", schema);
describe.skipIf(!uri)("shop cache", () => {
  let cache: typeof import("../src/lib/db/shop-cache");
  let Probe: ReturnType<typeof probe>;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated test database required");
    // the other tests run with it off (vitest.config.ts); this one needs it on
    process.env.SHOP_CACHE_SECONDS = "60";
    cache = await import("../src/lib/db/shop-cache");
    cache.clearsShopCache(schema);
    Probe = probe();
    await mongoose.connect(uri!);
    await Probe.deleteMany({});
    // only the clock moves: the database driver keeps its real timers
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterAll(async () => {
    vi.useRealTimers();
    await mongoose.disconnect();
  });
  // a write keeps the cache off for two seconds; step past that before each check
  const later = () => vi.setSystemTime(Date.now() + 3000);

  it("shares one read, keeps it for a minute and freezes it", async () => {
    later();
    let reads = 0;
    const load = async () => ({ list: [++reads] });
    const [a, b] = await Promise.all([cache.shared("probe", load), cache.shared("probe", load)]);
    expect(reads).toBe(1);
    expect(a).toBe(b);
    expect(Object.isFrozen(a.list)).toBe(true);
    vi.setSystemTime(Date.now() + 59_000);
    await cache.shared("probe", load);
    expect(reads).toBe(1);
    vi.setSystemTime(Date.now() + 2_000);
    await cache.shared("probe", load);
    expect(reads).toBe(2);
  });

  it("keeps a shorter-lived answer (stock) only that long", async () => {
    later();
    let reads = 0;
    const load = async () => ++reads;
    await cache.shared("stock-probe", load, 5);
    vi.setSystemTime(Date.now() + 4_000);
    await cache.shared("stock-probe", load, 5);
    expect(reads).toBe(1);
    vi.setSystemTime(Date.now() + 2_000);
    await cache.shared("stock-probe", load, 5);
    expect(reads).toBe(2);
  });

  it("doesn't keep a failed read", async () => {
    later();
    await expect(cache.shared("fails", () => Promise.reject(Error("down")))).rejects.toThrow("down");
    expect(await cache.shared("fails", async () => "up")).toBe("up");
  });

  it("forgets everything on every kind of write", async () => {
    const one = () => Probe.findOne().orFail();
    const writes: Record<string, () => Promise<unknown>> = {
      create: () => Probe.create({ n: 1 }),
      save: async () => {
        const doc = await one();
        doc.n = 2;
        await doc.save();
      },
      insertMany: () => Probe.insertMany([{ n: 3 }, { n: 4 }]),
      updateOne: () => Probe.updateOne({}, { n: 5 }),
      updateMany: () => Probe.updateMany({}, { n: 6 }),
      "document updateOne": async () => (await one()).updateOne({ n: 7 }),
      findOneAndUpdate: () => Probe.findOneAndUpdate({}, { n: 8 }),
      findByIdAndUpdate: async () => Probe.findByIdAndUpdate((await one())._id, { n: 9 }),
      replaceOne: () => Probe.replaceOne({}, { n: 10 }),
      findOneAndReplace: () => Probe.findOneAndReplace({}, { n: 11 }),
      bulkWrite: () => Probe.bulkWrite([{ insertOne: { document: { n: 12 } } }]),
      findOneAndDelete: () => Probe.findOneAndDelete({}),
      "document deleteOne": async () => (await one()).deleteOne(),
      deleteOne: () => Probe.deleteOne({}),
      deleteMany: () => Probe.deleteMany({}),
    };
    for (const [name, write] of Object.entries(writes)) {
      later();
      let reads = 0;
      const load = async () => ++reads;
      await cache.shared("written", load);
      await cache.shared("written", load);
      expect(reads, name).toBe(1);
      await write();
      await cache.shared("written", load);
      expect(reads, `${name} empties the cache`).toBe(2);
    }
  });
});
