import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";

// needs no database, unlike tests/shop-cache.integration.test.ts
describe("shop cache past its minute", () => {
  let shared: typeof import("../src/lib/db/shop-cache").shared;
  beforeAll(async () => {
    // the other tests run with it off (vitest.config.ts); this one needs it on
    process.env.SHOP_CACHE_SECONDS = "60";
    ({ shared } = await import("../src/lib/db/shop-cache"));
    // only the clock moves
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  const after = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);
  /** Lets a read that was started behind the page arrive. */
  const landed = () => new Promise((resolve) => setImmediate(resolve));

  it("shows the copy it has while one fresh read goes on behind the page", async () => {
    let reads = 0;
    const load = async () => ++reads;
    expect(await shared("late", load)).toBe(1);
    after(90);
    // two pages at once both get the old copy, and one read starts, not two
    expect(await Promise.all([shared("late", load), shared("late", load)])).toEqual([1, 1]);
    expect(reads).toBe(2);
    await landed();
    expect(await shared("late", load)).toBe(2);
    expect(reads).toBe(2);
  });

  it("waits for a fresh read once the copy is more than five minutes past its minute", async () => {
    let reads = 0;
    const load = async () => ++reads;
    await shared("old", load);
    after(60 + 5 * 60 + 1);
    expect(await shared("old", load)).toBe(2);
  });

  it("never shows stock past its five seconds", async () => {
    let reads = 0;
    const load = async () => ++reads;
    await shared("stock-late", load, 5);
    after(6);
    expect(await shared("stock-late", load, 5)).toBe(2);
  });

  it("keeps the old copy when the fresh read fails, and tries again for the next page", async () => {
    expect(await shared("flaky", async () => "first")).toBe("first");
    after(90);
    expect(await shared("flaky", () => Promise.reject(Error("down")))).toBe("first");
    await landed();
    expect(await shared("flaky", async () => "second")).toBe("first");
    await landed();
    expect(await shared("flaky", async () => "third")).toBe("second");
  });
});
