import { describe, test, expect } from "vitest";
import { Session } from "../session.js";
import { defaultTransport } from "../transports/scheme-transport.js";
import { responseMeta } from "../response-meta.js";
import { HttpCache } from "./http-cache.js";
import { MemoryCacheStore } from "./memory-cache-store.js";
import { missingRanges } from "./ranges.js";
import { settle, startServer } from "../test-helpers/server.js";

/**
 * @import { CacheMode } from "../session.d.ts"
 */

describe("filling gaps in partial content", () => {
  test("missingRanges finds what no segment has", () => {
    const segments = [{ start: 0, length: 5 }, { start: 10, length: 5 }];
    expect(missingRanges(segments, 0, 19)).to.eql([{ start: 5, end: 9 }, { start: 15, end: 19 }]);
    expect(missingRanges(segments, 2, 12)).to.eql([{ start: 5, end: 9 }]);
    expect(missingRanges(segments, 0, 4)).to.eql([]);
    expect(missingRanges(segments, 16, 18)).to.eql([{ start: 16, end: 18 }]);
    expect(missingRanges([], 3, 7)).to.eql([{ start: 3, end: 7 }]);
  });

  test("only the missing bytes are fetched, with If-Range", async () => {
    const { server, file, get } = await setup();
    try {
      await get("bytes=0-9");
      const filled = await get("bytes=0-14");
      expect(filled).to.eql({ status: 206, body: "0123456789abcde", range: "bytes 0-14/20", cache: "filled", marks: ["cache:fill-gaps"] });
      expect(file.seen.at(-1)).to.eql({ range: "bytes=10-14", ifRange: "\"v1\"" });
      expect((await get("bytes=0-14")).cache, "now it's all stored").to.equal("hit");
    } finally {
      await server.close();
    }
  });

  test("several gaps are fetched as one range, and can make the whole", async () => {
    const { server, file, get } = await setup();
    try {
      await get("bytes=0-4");
      await get("bytes=10-14");
      const all = await get("bytes=0-19");
      expect(all.body).to.equal("0123456789abcdefghij");
      expect(all.cache).to.equal("filled");
      expect(file.seen.at(-1), "from the first gap to the last").to.eql({ range: "bytes=5-19", ifRange: "\"v1\"" });
      const plain = await get();
      expect([plain.status, plain.body, plain.cache]).to.eql([200, "0123456789abcdefghij", "hit"]);
      expect(file.seen.length).to.equal(3);
    } finally {
      await server.close();
    }
  });

  test("suffix and open-ended ranges are filled once the length is known", async () => {
    const { server, file, get } = await setup();
    try {
      await get("bytes=0-9");
      expect((await get("bytes=-15")).body).to.equal("56789abcdefghij");
      expect(file.seen.at(-1)).to.eql({ range: "bytes=10-19", ifRange: "\"v1\"" });
      expect((await get("bytes=3-")).cache).to.equal("hit");
    } finally {
      await server.close();
    }
  });

  test("if the file changed, If-Range brings all of the new version, and old bytes are never mixed in", async () => {
    const { server, file, store, url, get } = await setup();
    try {
      await get("bytes=0-9");
      file.state.body = "ABCDEFGHIJKLMNOPQRST";
      file.state.etag = "\"v2\"";
      const answer = await get("bytes=5-14");
      expect({ ...answer, marks: undefined }).to.eql({ status: 206, body: "FGHIJKLMNO", range: "bytes 5-14/20", cache: "miss", marks: undefined });
      const [entry] = store.match(url);
      expect(entry.partial, "the new version is stored whole").to.equal(undefined);
      expect(new TextDecoder().decode(entry.body)).to.equal("ABCDEFGHIJKLMNOPQRST");
      expect((await get()).body).to.equal("ABCDEFGHIJKLMNOPQRST");
    } finally {
      await server.close();
    }
  });

  test("stale parts are filled too, because If-Range checks them", async () => {
    const { server, file, get } = await setup();
    file.state.maxAge = 0;
    try {
      await get("bytes=0-9");
      const filled = await get("bytes=5-14");
      expect(filled.body).to.equal("56789abcde");
      expect(filled.cache).to.equal("filled");
      expect(file.seen.at(-1)).to.eql({ range: "bytes=10-14", ifRange: "\"v1\"" });
    } finally {
      await server.close();
    }
  });

  test("without a strong ETag, or with nothing in the range stored, the whole range is fetched", async () => {
    {
      const { server, file, get } = await setup();
      file.state.etag = "W/\"weak\"";
      try {
        await get("bytes=0-9");
        await get("bytes=5-14");
        expect(file.seen.at(-1)).to.eql({ range: "bytes=5-14", ifRange: undefined });
      } finally {
        await server.close();
      }
    }
    {
      const { server, file, get } = await setup();
      try {
        await get("bytes=0-4");
        await get("bytes=10-14");
        expect(file.seen.at(-1)).to.eql({ range: "bytes=10-14", ifRange: undefined });
      } finally {
        await server.close();
      }
    }
  });

  test("only-if-cached never fills gaps, and force-cache does", async () => {
    const { server, file, get } = await setup();
    try {
      await get("bytes=0-9");
      const before = file.seen.length;
      await expect(get("bytes=0-14", "only-if-cached")).rejects.toThrow(/isn't in the cache/);
      expect(file.seen.length, "only-if-cached doesn't fetch").to.equal(before);
      const forced = await get("bytes=0-14", "force-cache");
      expect(file.seen.at(-1)).to.eql({ range: "bytes=10-14", ifRange: "\"v1\"" });
      expect(forced.body).to.equal("0123456789abcde");
    } finally {
      await server.close();
    }
  });
});

const setup = async () => {
  const state = { body: "0123456789abcdefghij", etag: "\"v1\"", maxAge: 600 };
  /** @type {{ range?: string, ifRange?: string }[]} */
  const seen = [];
  const server = await startServer((request, response) => {
    const ifRange = /** @type string | undefined */ (request.headers["if-range"]);
    seen.push({ range: request.headers.range, ifRange });
    const { body } = state;
    response.setHeader("cache-control", `max-age=${state.maxAge}`);
    response.setHeader("content-type", "text/plain");
    response.setHeader("etag", state.etag);
    const match = request.headers.range && /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    // RFC 9110 §13.1.5: an If-Range that doesn't match means "send all of it"
    if (!match || (ifRange !== undefined && ifRange !== state.etag)) {
      response.end(body);
      return;
    }
    const start = match[1] === "" ? body.length - Number(match[2]) : Number(match[1]);
    const end = match[1] === "" || match[2] === "" ? body.length - 1 : Math.min(Number(match[2]), body.length - 1);
    response.writeHead(206, { "content-range": `bytes ${start}-${end}/${body.length}` });
    response.end(body.slice(start, end + 1));
  });
  const store = new MemoryCacheStore();
  const session = new Session(new HttpCache(defaultTransport(), { store }), { baseURL: server.url });

  /** @type (range?: string, cache?: CacheMode) => Promise<{ status: number, body: string, range: string | null, cache: string | undefined, marks?: string[] }> */
  const get = async (range, cache) => {
    const response = await session.fetch("/f", { headers: range ? { range } : {}, cache });
    const body = await response.text();
    await settle();
    const marks = responseMeta(response).record?.marks.map((mark) => mark.name)
      .filter((name) => name.startsWith("cache:"));
    return { status: response.status, body, range: response.headers.get("content-range"), cache: responseMeta(response).cache, ...marks?.length ? { marks } : {} };
  };
  return { server, file: { state, seen }, store, get, url: `${server.url}/f` };
};
