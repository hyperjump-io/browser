import { describe, test, expect } from "vitest";
import { MemoryCacheStore } from "./memory-cache-store.js";

/**
 * @import { CachedEntry } from "./http-cache.d.ts"
 */

/** @type (url: string, extra?: Partial<CachedEntry>) => CachedEntry */
const entry = (url, extra = {}) => ({
  url,
  status: 200,
  statusText: "OK",
  headers: [],
  body: new Uint8Array(),
  requestHeaders: [],
  requestTime: 0,
  responseTime: 0,
  ...extra
});

describe("the memory cache store", () => {
  test("keeps a variant for each Vary, and replaces the one a put is for", () => {
    const store = new MemoryCacheStore();
    /** @type (language: string, status: number) => CachedEntry */
    const variant = (language, status) => entry("https://a.test/", { status, headers: [["vary", "accept-language"]], requestHeaders: [["accept-language", language]] });
    store.put(variant("en", 200));
    store.put(variant("fr", 203));
    store.put(variant("en", 201));
    const statuses = store.match("https://a.test/").map((stored) => stored.status);
    expect(statuses.toSorted((a, b) => a - b)).to.eql([201, 203]);
  });

  // Each is 118 bytes: a 100-byte body, a 16-character URL, and "OK"
  /** @type (url: string) => CachedEntry */
  const sized = (url) => entry(url, { body: new Uint8Array(100) });

  test("its size is the bytes of its bodies and their headers", () => {
    const store = new MemoryCacheStore();
    store.put(sized("https://a.test/1"));
    store.put(entry("https://a.test/2", { headers: [["etag", "\"x\""]], body: new Uint8Array(10) }));

    expect(store.size).to.equal(118 + (10 + 16 + 2 + 4 + 3));
  });

  test("forgets the least recently used URLs past its maxSize", () => {
    const store = new MemoryCacheStore({ maxSize: 250 });
    store.put(sized("https://a.test/1"));
    store.put(sized("https://a.test/2"));
    store.match("https://a.test/1");
    store.put(sized("https://a.test/3"));

    expect(store.size).to.equal(2 * 118);
    expect(store.match("https://a.test/2")).to.eql([]);
    expect(store.match("https://a.test/1").length).to.equal(1);
  });

  test("doesn't keep a URL that's bigger than its maxSize on its own", () => {
    const store = new MemoryCacheStore({ maxSize: 100 });
    store.put(sized("https://a.test/1"));

    expect(store.match("https://a.test/1")).to.eql([]);
    expect(store.size).to.equal(0);
  });

  test("a variant that replaces another, and a delete, change its size", () => {
    const store = new MemoryCacheStore();
    store.put(sized("https://a.test/1"));
    store.put(entry("https://a.test/1", { body: new Uint8Array(50) }));
    expect(store.size).to.equal(50 + 16 + 2);

    store.delete("https://a.test/1");
    expect(store.size).to.equal(0);
  });

  test("its maxSize is 64 MB by default", () => {
    const store = new MemoryCacheStore();
    store.put(entry("https://a.test/1", { body: new Uint8Array(40 * 1024 * 1024) }));
    store.put(entry("https://a.test/2", { body: new Uint8Array(40 * 1024 * 1024) }));

    expect(store.match("https://a.test/1"), "the first is forgotten").to.eql([]);
    expect(store.match("https://a.test/2").length).to.equal(1);
  });

  test("deletes every variant of a URL", () => {
    const store = new MemoryCacheStore();
    store.put(entry("https://a.test/"));
    store.delete("https://a.test/");
    expect(store.match("https://a.test/")).to.eql([]);
  });
});
