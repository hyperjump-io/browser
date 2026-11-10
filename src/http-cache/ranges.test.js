import { describe, test, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Session } from "../session.js";
import { fetcher } from "../layers.js";
import { defaultTransport } from "../transports/scheme-transport.js";
import { responseMeta } from "../response-meta.js";
import { HttpCache } from "./http-cache.js";
import { MemoryCacheStore } from "./memory-cache-store.js";
import { FileCacheStore } from "./file-cache-store.js";
import { addSegment, parseContentRange, parseRange, resolveRange, sliceSegments } from "./ranges.js";
import { settle, startServer } from "../test-helpers/server.js";

/**
 * @import { IncomingMessage, ServerResponse } from "node:http"
 * @import { CacheStore } from "./http-cache.d.ts"
 * @import { CacheMode } from "../session.d.ts"
 */

const data = "0123456789abcdefghij";

describe("partial content", () => {
  describe("ranges", () => {
    test("parse one byte range in each form", () => {
      expect(parseRange("bytes=0-4")).to.eql({ kind: "from", start: 0, end: 4 });
      expect(parseRange("bytes=10-")).to.eql({ kind: "from", start: 10 });
      expect(parseRange("bytes=-5")).to.eql({ kind: "suffix", length: 5 });
      expect(parseRange("bytes=0-1,5-6"), "several ranges aren't handled").to.equal(undefined);
      expect(parseRange("bytes=5-2")).to.equal(undefined);
      expect(parseRange("items=0-1")).to.equal(undefined);
    });

    test("resolve against a length", () => {
      expect(resolveRange({ kind: "suffix", length: 5 }, 20)).to.eql({ start: 15, end: 19 });
      expect(resolveRange({ kind: "from", start: 18, end: 100 }, 20)).to.eql({ start: 18, end: 19 });
      expect(resolveRange({ kind: "from", start: 20 }, 20)).to.equal("unsatisfiable");
      expect(resolveRange({ kind: "from", start: 3 }, undefined)).to.equal(undefined);
    });

    test("parse a Content-Range", () => {
      expect(parseContentRange("bytes 5-9/20")).to.eql({ start: 5, end: 9, length: 20 });
      expect(parseContentRange("bytes 5-9/*")).to.eql({ start: 5, end: 9, length: undefined });
      expect(parseContentRange("bytes 5-25/20")).to.equal(undefined);
    });

    test("join segments, and slice them", () => {
      const encode = (/** @type string */ text) => new TextEncoder().encode(text);
      let segments = addSegment({ segments: [], body: new Uint8Array(0) }, 10, encode("abcde"));
      segments = addSegment(segments, 0, encode("01234"));
      expect(segments.segments).to.eql([{ start: 0, length: 5 }, { start: 10, length: 5 }]);
      segments = addSegment(segments, 3, encode("3456789ab"));
      expect(segments.segments, "the gap is filled, overlapping both sides").to.eql([{ start: 0, length: 15 }]);
      expect(new TextDecoder().decode(segments.body)).to.equal("0123456789abcde");
      expect(new TextDecoder().decode(sliceSegments(segments, 8, 11))).to.equal("89ab");
      expect(sliceSegments(segments, 12, 16)).to.equal(undefined);
    });
  });

  test("a range is answered from a whole copy", async () => {
    const { server, get, hits } = await setup();
    try {
      expect((await get("/file")).body).to.equal(data);
      expect(await get("/file", "bytes=0-4")).to.eql({ status: 206, body: "01234", range: "bytes 0-4/20", cache: "hit" });
      expect(await get("/file", "bytes=15-")).to.eql({ status: 206, body: "fghij", range: "bytes 15-19/20", cache: "hit" });
      expect(await get("/file", "bytes=-3")).to.eql({ status: 206, body: "hij", range: "bytes 17-19/20", cache: "hit" });
      expect(await get("/file", "bytes=18-99")).to.eql({ status: 206, body: "ij", range: "bytes 18-19/20", cache: "hit" });
      expect(await get("/file", "bytes=20-")).to.eql({ status: 416, body: "", range: "bytes */20", cache: "hit" });
      expect(hits("/file")).to.equal(1);
    } finally {
      await server.close();
    }
  });

  test("a 206 is stored, and answers the ranges it has", async () => {
    const { server, get, hits } = await setup();
    try {
      expect(await get("/file", "bytes=0-9")).to.eql({ status: 206, body: "0123456789", range: "bytes 0-9/20", cache: "miss" });
      expect(await get("/file", "bytes=2-5")).to.eql({ status: 206, body: "2345", range: "bytes 2-5/20", cache: "hit" });
      expect(hits("/file")).to.equal(1);

      await get("/file", "bytes=10-14");
      expect(await get("/file", "bytes=5-14"), "joined to the part already stored").to.eql({ status: 206, body: "56789abcde", range: "bytes 5-14/20", cache: "hit" });

      expect((await get("/file")).cache, "parts can't answer a request for all of it").to.equal("miss");
    } finally {
      await server.close();
    }
  });

  test("parts that add up to the whole become a whole copy", async () => {
    const { server, get, hits } = await setup();
    try {
      await get("/file", "bytes=0-9");
      await get("/file", "bytes=10-");
      expect(await get("/file")).to.eql({ status: 200, body: data, range: null, cache: "hit" });
      expect(hits("/file")).to.equal(2);
    } finally {
      await server.close();
    }
  });

  test("parts are only joined when they have the same strong ETag", async () => {
    let etag = "\"a\"";
    let body = data;
    const server = await startServer((request, response) => serveRanges(request, response, { etag, body }));
    try {
      const session = new Session(new HttpCache(defaultTransport()), { baseURL: server.url });
      /** @type (range: string, cache?: CacheMode) => Promise<string> */
      const get = async (range, cache) => {
        const response = await session.fetch("/v", { headers: { range }, cache });
        const text = await response.text();
        await settle();
        return text;
      };
      expect(await get("bytes=0-4")).to.equal("01234");

      // Another ETag is another version of the file
      etag = "\"b\"";
      body = "ABCDEFGHIJKLMNOPQRST";
      expect(await get("bytes=5-9")).to.equal("FGHIJ");
      expect(await get("bytes=5-9", "only-if-cached")).to.equal("FGHIJ");
      await expect(get("bytes=0-9", "only-if-cached"), "the old version's bytes weren't joined to the new").rejects.toThrow(/isn't in the cache/);
      await expect(get("bytes=0-4", "only-if-cached"), "the old part was replaced").rejects.toThrow(/isn't in the cache/);

      etag = "W/\"weak\"";
      await get("bytes=0-4");
      await get("bytes=5-9");
      await expect(get("bytes=0-9", "only-if-cached"), "weak ETags are never joined").rejects.toThrow(/isn't in the cache/);
    } finally {
      await server.close();
    }
  });

  test("without an ETag, only the latest part is kept", async () => {
    const server = await startServer((request, response) => serveRanges(request, response, { etag: undefined, body: data }));
    try {
      const session = new Session(new HttpCache(defaultTransport()), { baseURL: server.url });
      /** @type (range: string) => Promise<string | undefined> */
      const cacheOf = async (range) => {
        const response = await session.fetch("/n", { headers: { range } });
        await response.text();
        await settle();
        return responseMeta(response).cache;
      };
      await cacheOf("bytes=0-4");
      await cacheOf("bytes=10-14");
      expect(await cacheOf("bytes=10-14")).to.equal("hit");
      expect(await cacheOf("bytes=0-4")).to.equal("miss");
    } finally {
      await server.close();
    }
  });

  test("a server that sends all of it gives a whole copy, which answers ranges", async () => {
    const { server, get, hits } = await setup();
    try {
      expect(await get("/ignores-range", "bytes=0-4")).to.eql({ status: 200, body: data, range: null, cache: "miss" });
      expect(await get("/ignores-range", "bytes=0-4")).to.eql({ status: 206, body: "01234", range: "bytes 0-4/20", cache: "hit" });
      expect(hits("/ignores-range")).to.equal(1);
    } finally {
      await server.close();
    }
  });

  test("several ranges, If-Range, and cache modes", async () => {
    const { server, get, hits } = await setup();
    try {
      await get("/file");
      expect((await get("/file", "bytes=0-1,5-6")).cache).to.equal("bypass");
      expect(hits("/file")).to.equal(2);

      expect((await get("/file", "bytes=0-1", { headers: { "if-range": "\"v1\"" } })).cache, "If-Range makes it conditional").to.equal("bypass");
      expect(hits("/file")).to.equal(3);

      expect((await get("/file", "bytes=0-1", { cache: "reload" })).cache).to.equal("miss");
      expect((await get("/file", "bytes=0-1", { cache: "no-store" })).cache).to.equal("bypass");
      expect((await get("/file", "bytes=0-1", { cache: "force-cache" })).cache).to.equal("hit");
    } finally {
      await server.close();
    }
  });

  test("parts are kept by the file cache store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "browser-ranges-"));
    const { server, get } = await setup(new FileCacheStore({ directory }));
    const url = `${server.url}/file`;
    try {
      await get("/file", "bytes=0-4");
      await get("/file", "bytes=10-14");
    } finally {
      await server.close();
    }

    const [stored] = await new FileCacheStore({ directory }).match(url);
    expect(stored.partial).to.eql({ length: 20, segments: [{ start: 0, length: 5 }, { start: 10, length: 5 }] });

    // A new process, without a network
    const offline = new Session(new HttpCache(fetcher(() => Promise.reject(new TypeError("offline"))), { store: new FileCacheStore({ directory }) }));
    const response = await offline.fetch(url, { headers: { range: "bytes=11-13" } });
    expect(response.status).to.equal(206);
    expect(await response.text()).to.equal("bcd");
  });
});

/**
 * Serves `body` with Range support. `/ignores-range` always sends all of it.
 *
 * @type (request: IncomingMessage, response: ServerResponse, file: { etag: string | undefined, body: string }) => void
 */
const serveRanges = (request, response, { etag, body }) => {
  const url = new URL(/** @type string */ (request.url), "http://localhost");
  response.setHeader("cache-control", "max-age=600");
  response.setHeader("content-type", "text/plain");
  if (etag) {
    response.setHeader("etag", etag);
  }
  response.setHeader("accept-ranges", "bytes");
  const range = url.pathname === "/ignores-range" ? undefined : request.headers.range;
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    response.end(body);
    return;
  }
  const start = Math.max(0, match[1] === "" ? body.length - Number(match[2]) : Number(match[1]));
  const end = match[1] === "" || match[2] === "" ? body.length - 1 : Math.min(Number(match[2]), body.length - 1);
  if (start >= body.length) {
    response.writeHead(416, { "content-range": `bytes */${body.length}` }).end();
    return;
  }
  response.writeHead(206, { "content-range": `bytes ${start}-${end}/${body.length}` });
  response.end(body.slice(start, end + 1));
};

/** @param {CacheStore} [store] */
const setup = async (store = new MemoryCacheStore()) => {
  const server = await startServer((request, response) => serveRanges(request, response, { etag: "\"v1\"", body: data }));
  const session = new Session(new HttpCache(defaultTransport(), { store }), { baseURL: server.url });

  /** @type (path: string, range?: string, init?: { headers?: Record<string, string>, cache?: CacheMode }) => Promise<{ status: number, body: string, range: string | null, cache: string | undefined }> */
  const get = async (path, range, init = {}) => {
    const response = await session.fetch(path, { cache: init.cache, headers: { ...range ? { range } : {}, ...init.headers } });
    const body = await response.text();
    await settle();
    return { status: response.status, body, range: response.headers.get("content-range"), cache: responseMeta(response).cache };
  };
  return { server, session, get, hits: (/** @type string */ path) => server.hits.get(path) ?? 0 };
};
