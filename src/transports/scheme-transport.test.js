import { describe, test, expect } from "vitest";
import { createServer } from "node:net";
import { SchemeTransport, defaultTransport } from "./scheme-transport.js";
import { fetcher } from "../layers.js";
import { responseMeta } from "../response-meta.js";
import { testHyperjump } from "../test-helpers/hyperjump.js";
import { startServer } from "../test-helpers/server.js";

/**
 * @import { CacheMode } from "../hyperjump.d.ts"
 */

describe("the scheme transport", () => {
  test("gives a request to the fetcher for its scheme", async () => {
    const transport = new SchemeTransport({ "a:": fetcher(() => new Response("a")) });
    expect(await (await testHyperjump(transport, { allow: ["a:x", "b:x"] }).fetch("a:x")).text()).to.equal("a");
  });

  test("a scheme without a fetcher is a network error", async () => {
    const transport = new SchemeTransport({});
    const fetching = testHyperjump(transport, { allow: ["a:x", "b:x"] }).fetch("a:x");
    await expect(fetching).rejects.toThrow(TypeError);
    await expect(fetching).rejects.toMatchObject({ cause: { code: "ERR_UNKNOWN_URL_SCHEME" } });
  });

  test("with adds and replaces schemes, and leaves the original alone", async () => {
    const original = new SchemeTransport({ "a:": fetcher(() => new Response("a")) });
    const changed = original.with({ "a:": fetcher(() => new Response("A")), "b:": fetcher(() => new Response("b")) });
    expect(await (await testHyperjump(changed, { allow: ["a:x", "b:x"] }).fetch("a:x")).text()).to.equal("A");
    expect(await (await testHyperjump(changed, { allow: ["a:x", "b:x"] }).fetch("b:x")).text()).to.equal("b");
    expect(await (await testHyperjump(original, { allow: ["a:x", "b:x"] }).fetch("a:x")).text()).to.equal("a");
  });

  test("the default transport fetches data: URLs with fetch", async () => {
    const response = await testHyperjump(defaultTransport()).fetch("data:text/plain,hi");
    expect(await response.text()).to.equal("hi");
    expect(responseMeta(response).source).to.equal("network");
  });

  test("the default transport doesn't fetch file: URLs", async () => {
    await expect(testHyperjump(defaultTransport(), { allow: ["file:///etc/hostname"] }).fetch("file:///etc/hostname")).rejects.toThrow(/isn't supported/);
  });

  test("a failed fetch names its URL, and its cause is the runtime's", async () => {
    const url = `http://127.0.0.1:${await closedPort()}/a.json`;
    const fetching = testHyperjump(defaultTransport(), { allow: [url] }).fetch(url);
    await expect(fetching).rejects.toThrow(TypeError);
    await expect(fetching).rejects.toThrow(`Failed to fetch '${url}': connect ECONNREFUSED`);
    await expect(fetching).rejects.toMatchObject({ cause: { code: "ECONNREFUSED" } });
  });

  test("an aborted fetch is given on as it is", async () => {
    const reason = new Error("stop");
    const fetching = testHyperjump(defaultTransport(), { allow: ["http://127.0.0.1:1/"] }).fetch("http://127.0.0.1:1/a.json", { signal: AbortSignal.abort(reason) });
    await expect(fetching).rejects.toBe(reason);
  });

  describe("the cache mode", () => {
    test("is the runtime's, so it sends the headers the Fetch standard adds for it", async () => {
      const server = await startServer((request, response) => {
        response.end(JSON.stringify({ pragma: request.headers.pragma ?? null, cacheControl: request.headers["cache-control"] ?? null }));
      });
      try {
        const session = testHyperjump(defaultTransport(), { allow: [server.url] });
        /** @type (cache: CacheMode, init?: RequestInit) => Promise<unknown> */
        const sent = async (cache, init = {}) => (await session.fetch(`${server.url}/`, { cache, ...init })).json();

        expect(await sent("default")).to.eql({ pragma: null, cacheControl: null });
        expect(await sent("no-store")).to.eql({ pragma: "no-cache", cacheControl: "no-cache" });
        expect(await sent("reload")).to.eql({ pragma: "no-cache", cacheControl: "no-cache" });
        expect(await sent("no-cache")).to.eql({ pragma: null, cacheControl: "max-age=0" });
        expect(await sent("force-cache")).to.eql({ pragma: null, cacheControl: null });
        expect(await sent("reload", { headers: { "cache-control": "max-age=5" } }), "a request's own wins").to.eql({ pragma: "no-cache", cacheControl: "max-age=5" });
        expect(await sent("reload", { method: "POST", body: "b" }), "with a body").to.eql({ pragma: "no-cache", cacheControl: "no-cache" });
      } finally {
        await server.close();
      }
    });

    test("only-if-cached that reaches the network is a miss, and it isn't sent", async () => {
      const server = await startServer((_request, response) => {
        response.end("sent");
      });
      try {
        const session = testHyperjump(defaultTransport(), { allow: [server.url] });

        const fetching = session.fetch(`${server.url}/`, { cache: "only-if-cached" });

        await expect(fetching).rejects.toThrow(TypeError);
        await expect(fetching).rejects.toMatchObject({ cause: { code: "ERR_CACHE_MISS" } });
        expect(server.requests).to.eql([]);
      } finally {
        await server.close();
      }
    });

    test("isn't for a URL that isn't HTTP", async () => {
      const session = testHyperjump(defaultTransport(), { allow: ["data:"] });

      expect(await (await session.fetch("data:text/plain,hi", { cache: "only-if-cached" })).text()).to.equal("hi");
    });
  });
});

/** A port nothing listens on, from a server that's closed */
const closedPort = () => new Promise((resolve) => {
  const server = createServer();
  server.listen(0, "127.0.0.1", () => {
    const { port } = /** @type import("node:net").AddressInfo */ (server.address());
    server.close(() => resolve(port));
  });
});
