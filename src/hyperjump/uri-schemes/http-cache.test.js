import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { FileHttpCacheStore, Hyperjump, HttpUriSchemePlugin, MemoryHttpCacheStore } from "../index.js";
import { toJson } from "../../json/jsonast-util.js";

/**
 * @import { HttpCacheStore } from "../index.js"
 */

describe("JSON Browser", () => {
  describe("HTTP cache", () => {
    const testDomain = "https://example.com";
    const uri = `${testDomain}/foo#/foo`;
    const contentType = { "content-type": "application/reference+json" };

    /** @type MockAgent */
    let mockAgent;

    beforeEach(() => {
      mockAgent = new MockAgent();
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);
    });

    afterEach(async () => {
      mockAgent.assertNoPendingInterceptors();
      await mockAgent.close();
    });

    /** @type (cache?: HttpCacheStore) => Hyperjump */
    const withCache = (cache) => {
      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      hyperjump.addUriSchemePlugin(new HttpUriSchemePlugin({ cache }));
      return hyperjump;
    };

    test("a fresh response is used by another session", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: { ...contentType, "cache-control": "max-age=60" } });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      await hyperjump.session().get(uri);
      const subject = await hyperjump.session().get(uri);

      expect(toJson(subject)).to.equal(`42`);
    });

    test("a response that can't be stored isn't cached", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: { ...contentType, "cache-control": "no-store" } });
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 24 }`, { headers: contentType });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      await hyperjump.session().get(uri);
      const subject = await hyperjump.session().get(uri);

      expect(toJson(subject)).to.equal(`24`);
    });

    test("a stale response that wasn't modified is used after revalidating", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: { ...contentType, "cache-control": "no-cache", "etag": `"1"` } });
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo", headers: { "if-none-match": `"1"` } })
        .reply(304, "", { headers: { etag: `"1"` } });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      await hyperjump.session().get(uri);
      const subject = await hyperjump.session().get(uri);

      expect(toJson(subject)).to.equal(`42`);
    });

    test("a stale response that was modified is replaced", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: { ...contentType, "cache-control": "no-cache", "etag": `"1"` } });
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo", headers: { "if-none-match": `"1"` } })
        .reply(200, `{ "foo": 24 }`, { headers: { ...contentType, "cache-control": "no-cache", "etag": `"2"` } });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      await hyperjump.session().get(uri);
      const subject = await hyperjump.session().get(uri);

      expect(toJson(subject)).to.equal(`24`);
    });

    test("a 304 that doesn't match the cached response is retried without revalidating", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: { ...contentType, "cache-control": "no-cache", "etag": `"1"` } });
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo", headers: { "if-none-match": `"1"` } })
        .reply(304, "", { headers: { etag: `"2"` } });
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo", headers: (headers) => !("if-none-match" in headers) })
        .reply(200, `{ "foo": 24 }`, { headers: { ...contentType, "cache-control": "no-cache", "etag": `"2"` } });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      await hyperjump.session().get(uri);
      const subject = await hyperjump.session().get(uri);

      expect(toJson(subject)).to.equal(`24`);
    });

    test("sessions retrieving the same URL at the same time share one request", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: contentType });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const [first, second] = await Promise.all([
        hyperjump.session().get(uri),
        hyperjump.session().get(uri)
      ]);

      expect(toJson(first)).to.equal(`42`);
      expect(toJson(second)).to.equal(`42`);
    });

    test("without a cache, nothing is cached", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: { ...contentType, "cache-control": "max-age=60" } });
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 24 }`, { headers: contentType });

      const hyperjump = withCache(undefined);
      await hyperjump.session().get(uri);
      const subject = await hyperjump.session().get(uri);

      expect(toJson(subject)).to.equal(`24`);
    });

    test("a cache can be shared by more than one Hyperjump", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: { ...contentType, "cache-control": "max-age=60" } });

      const cache = new MemoryHttpCacheStore();
      await withCache(cache).session()
        .get(uri);
      const subject = await withCache(cache).session()
        .get(uri);

      expect(toJson(subject)).to.equal(`42`);
    });

    test("a stale response is revalidated with the plugin's headers", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: { ...contentType, "cache-control": "no-cache", "etag": `"1"` } });
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo", headers: { "if-none-match": `"1"`, "authorization": "Bearer token" } })
        .reply(304, "", { headers: { etag: `"1"` } });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const headers = () => ({ Authorization: "Bearer token" });
      hyperjump.addUriSchemePlugin(new HttpUriSchemePlugin({ cache: new MemoryHttpCacheStore(), headers }));
      await hyperjump.session().get(uri);
      const subject = await hyperjump.session().get(uri);

      expect(toJson(subject)).to.equal(`42`);
    });

    test("a response that varies by a header isn't used for a request with a different one", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo", headers: { authorization: "Bearer 1" } })
        .reply(200, `{ "foo": 42 }`, { headers: { ...contentType, "cache-control": "max-age=60", "vary": "authorization" } });
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo", headers: { authorization: "Bearer 2" } })
        .reply(200, `{ "foo": 24 }`, { headers: contentType });

      const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      let token = 1;
      const headers = () => ({ Authorization: `Bearer ${token}` });
      hyperjump.addUriSchemePlugin(new HttpUriSchemePlugin({ cache: new MemoryHttpCacheStore(), headers }));
      await hyperjump.session().get(uri);
      token = 2;
      const subject = await hyperjump.session().get(uri);

      expect(toJson(subject)).to.equal(`24`);
    });

    describe("FileHttpCacheStore", () => {
      /** @type string */
      let directory;

      beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "hyperjump-http-cache-"));
      });

      afterEach(async () => {
        await rm(directory, { recursive: true });
      });

      test("a cache in a directory outlives the store", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `{ "foo": 42 }`, { headers: { ...contentType, "cache-control": "max-age=60" } });

        const cacheDirectory = join(directory, "cache");
        await withCache(new FileHttpCacheStore(cacheDirectory)).session()
          .get(uri);
        const subject = await withCache(new FileHttpCacheStore(cacheDirectory)).session()
          .get(uri);

        expect(toJson(subject)).to.equal(`42`);
      });

      test("a missing entry", async () => {
        const store = new FileHttpCacheStore(directory);

        expect(await store.get(`${testDomain}/foo`)).to.equal(undefined);
      });

      test("delete", async () => {
        const store = new FileHttpCacheStore(directory);
        await store.set(`${testDomain}/foo`, { url: `${testDomain}/foo`, body: "{}", policy: {} });
        await store.delete(`${testDomain}/foo`);

        expect(await store.get(`${testDomain}/foo`)).to.equal(undefined);
      });
    });
  });
});
