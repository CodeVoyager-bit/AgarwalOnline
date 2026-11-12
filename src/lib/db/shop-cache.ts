import type { Schema } from "mongoose";

/**
 * What every shopper page reads but staff rarely change (products, packs and prices, review
 * scores, aisles, delivery areas and rules, offers, tax details), kept in this server's memory
 * for a minute instead of read from Atlas on every page. The free cluster allows 100 operations a
 * second and a page used to make 11–14 of them, so about 100 shoppers at once filled it (load
 * test, 2026-10-11). Stock is kept for five seconds only.
 *
 * Any write to those collections from this server (page, action, cron or script) empties it,
 * through `clearsShopCache` on their schemas; other servers catch up within the minute. The
 * tests set SHOP_CACHE_SECONDS=0, because they write to the database behind the app's back.
 *
 * A server nobody has visited for a few minutes used to make its next visitor wait while it read
 * everything again. Now that visitor gets the copy it has, up to five minutes past its minute, and
 * the fresh read goes on behind the page for the next one. Stock never does this.
 */
const SECONDS = Number(process.env.SHOP_CACHE_SECONDS ?? 60);
const STALE_SECONDS = SECONDS * 5;

type Entry = { at: number; value: Promise<unknown>; next?: Entry };
// on globalThis, like the database client: a dev hot reload keeps one cache that the schemas' hooks empty
const globalCache = globalThis as typeof globalThis & { shopCache?: { entries: Map<string, Entry>; changedAt: number } };
const shop = (globalCache.shopCache ??= { entries: new Map(), changedAt: 0 });

/**
 * `load()`'s answer, shared by every page on this server for a minute (or `seconds`, if shorter;
 * those are never shown past their time). Pages that ask while it is loading wait for the same
 * read. The answer is frozen: it is shared, so changing it in place would change it for every shopper.
 */
export function shared<T>(key: string, load: () => Promise<T>, seconds = SECONDS): Promise<T> {
  const now = Date.now();
  const hit = shop.entries.get(key);
  // read before or just after a write: never trusted
  const age = hit && hit.at > shop.changedAt ? (now - hit.at) / 1000 : Infinity;
  const life = Math.min(seconds, SECONDS);
  if (hit && age < life) return hit.value as Promise<T>;
  const read = (): Entry => {
    const entry: Entry = { at: now, value: load().then(freeze) };
    // a failed read isn't kept: the next page tries again
    entry.value.catch(() => shop.entries.get(key) === entry && shop.entries.delete(key));
    return entry;
  };
  // a little past its time (never stock, kept five seconds): this page gets the copy that is here
  if (hit && seconds >= SECONDS && age < life + STALE_SECONDS) {
    if (!hit.next) {
      const next = (hit.next = read());
      // takes its place once it has arrived, unless a write emptied the cache meanwhile
      next.value.then(
        () => shop.entries.get(key) === hit && shop.entries.set(key, next),
        () => (hit.next = undefined),
      );
    }
    return hit.value as Promise<T>;
  }
  const entry = read();
  shop.entries.set(key, entry);
  return entry.value as Promise<T>;
}

/** Plain objects and arrays only: ids, dates and buffers stay as they are. */
function freeze<T>(value: T): T {
  if (Array.isArray(value) || (value && Object.getPrototypeOf(value) === Object.prototype)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

/**
 * Forgets everything, and for two seconds doesn't keep what is read either: the write may be in
 * a transaction that hasn't committed yet, and a page reading meanwhile would keep the old data.
 */
function changed() {
  shop.entries.clear();
  // ponytail: a transaction slower than 2 s can leave the old data cached for up to a minute
  shop.changedAt = Date.now() + 2000;
}

/** Every way Mongoose writes, as a document or a query; raw `collection` writes bypass it. */
const WRITES = [
  "save",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "replaceOne",
] as const;

/** Call on a schema before compiling its model: any write to it empties the shop cache. */
export function clearsShopCache(schema: Schema) {
  schema.post([...WRITES], { document: true, query: true }, changed);
  schema.post("insertMany", changed);
  schema.post("bulkWrite", changed);
}
