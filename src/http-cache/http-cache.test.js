import { describe, test, expect } from "vitest";
import { Session } from "../session.js";
import { compose } from "../layers.js";
import { defaultTransport } from "../transports/scheme-transport.js";
import { responseMeta } from "../response-meta.js";
import { HttpCache, httpCache } from "./http-cache.js";
import { MemoryCacheStore } from "./memory-cache-store.js";
import { settle, startServer } from "../test-helpers/server.js";

/**
 * @import { IncomingMessage, ServerResponse } from "node:http"
 * @import { CacheStore, HttpCacheOptions } from "./http-cache.d.ts"
 * @import { SessionFetchInit } from "../session.d.ts"
 */

/** @type Record<string, (request: IncomingMessage, response: ServerResponse) => void> */
const routes = {
  "/max-age": (_request, response) => {
    response.setHeader("cache-control", "max-age=60");
    response.end("cached for a minute");
  },
  "/no-store": (_request, response) => {
    response.setHeader("cache-control", "no-store");
    response.end("never cached");
  },
  "/etag": (request, response) => {
    response.setHeader("etag", "\"v1\"");
    response.setHeader("cache-control", "max-age=10");
    if (request.headers["if-none-match"] === "\"v1\"") {
      response.setHeader("x-revalidated", "yes");
      response.statusCode = 304;
      response.end();
      return;
    }
    response.end("etag body");
  },
  "/no-cache": (request, response) => {
    response.setHeader("etag", "\"nc\"");
    response.setHeader("cache-control", "no-cache");
    if (request.headers["if-none-match"] === "\"nc\"") {
      response.statusCode = 304;
      response.end();
      return;
    }
    response.end("always revalidated");
  },
  "/vary": (request, response) => {
    response.setHeader("cache-control", "max-age=60");
    response.setHeader("vary", "accept-language");
    response.end(`lang=${request.headers["accept-language"]}`);
  },
  "/heuristic": (_request, response) => {
    // Last modified 1000s ago, so fresh for 100s
    response.setHeader("last-modified", new Date(Date.now() - 1_000_000).toUTCString());
    response.end("heuristic");
  },
  "/swr": (_request, response) => {
    response.setHeader("cache-control", "max-age=1, stale-while-revalidate=60");
    response.end(`swr ${Math.random()}`);
  },
  "/item": (request, response) => {
    response.setHeader("cache-control", "max-age=60");
    response.end(request.method === "POST" ? "updated" : "item");
  },
  "/moved": (_request, response) => response.writeHead(301, { location: "/target" }).end(),
  "/moved-308": (_request, response) => response.writeHead(308, { location: "/target" }).end(),
  "/temporary": (_request, response) => response.writeHead(302, { location: "/target" }).end(),
  "/temporary-to-fresh": (_request, response) => response.writeHead(302, { location: "/item" }).end(),
  "/moved-max-age-0": (_request, response) => response.writeHead(301, { "location": "/target", "cache-control": "max-age=0" }).end(),
  "/moved-old": (_request, response) => {
    // Last modified ~115 days ago, so ~11.5 days fresh by Last-Modified
    response.writeHead(301, { "location": "/target", "last-modified": new Date(Date.now() - 10_000_000_000).toUTCString() }).end();
  },
  "/missing": (_request, response) => response.writeHead(404).end("not here"),
  "/target": (_request, response) => response.end("target"),
  "/hop-by-hop": (_request, response) => {
    response.setHeader("connection", "keep-alive, x-private-hop");
    response.setHeader("x-private-hop", "1");
    response.setHeader("x-kept", "1");
    response.setHeader("cache-control", "max-age=60");
    response.end("body");
  }
};

/** @param {Omit<HttpCacheOptions, "now"> & { manual?: boolean }} [options] */
const setup = async (options = {}) => {
  let now = Date.now();
  // The server's Date follows the same fake clock, as if both agreed on the time
  const server = await startServer((request, response) => {
    response.setHeader("date", new Date(now).toUTCString());
    routes[new URL(/** @type string */ (request.url), "http://localhost").pathname](request, response);
  });
  const store = options.store ?? new MemoryCacheStore();
  const cache = new HttpCache(defaultTransport(), { ...options, store, now: () => now });
  const session = new Session(cache, { baseURL: server.url });

  /** @type (path: string, init?: SessionFetchInit) => Promise<{ response: Response, body: string, cache: string | undefined }> */
  const get = async (path, init) => {
    const response = await session.fetch(path, { redirect: options.manual ? "manual" : "follow", ...init });
    const body = await response.text();
    await settle();
    return { response, body, cache: responseMeta(response).cache };
  };
  const advance = (/** @type number */ seconds) => {
    now += seconds * 1000;
  };
  const hits = (/** @type string */ path) => server.hits.get(path) ?? 0;
  return { server, store, cache, session, get, advance, hits };
};

describe("the HTTP cache", () => {
  test("serves fresh responses from the cache", async () => {
    const { server, get, advance, hits } = await setup();
    try {
      expect((await get("/max-age")).cache).to.equal("miss");
      advance(30);
      const second = await get("/max-age");
      expect(second.cache).to.equal("hit");
      expect(second.body).to.equal("cached for a minute");
      expect(second.response.url).to.equal(`${server.url}/max-age`);
      expect(Number(second.response.headers.get("age"))).to.be.greaterThanOrEqual(30);
      expect(hits("/max-age")).to.equal(1);

      advance(31);
      expect((await get("/max-age")).cache, "stale without a validator, so fetched again").to.equal("miss");
      expect(hits("/max-age")).to.equal(2);
    } finally {
      await server.close();
    }
  });

  test("doesn't store no-store responses", async () => {
    const { server, get, hits } = await setup();
    try {
      await get("/no-store");
      await get("/no-store");
      expect(hits("/no-store")).to.equal(2);
    } finally {
      await server.close();
    }
  });

  test("revalidates a stale response with its ETag, and merges the 304's headers", async () => {
    const { server, get, advance, hits } = await setup();
    try {
      await get("/etag");
      advance(11);
      const revalidated = await get("/etag");
      expect(revalidated.cache).to.equal("revalidated");
      expect(revalidated.response.status).to.equal(200);
      expect(revalidated.body).to.equal("etag body");
      expect(revalidated.response.headers.get("x-revalidated")).to.equal("yes");
      expect(server.requests.at(-1)?.headers["if-none-match"]).to.equal("\"v1\"");

      advance(5);
      expect((await get("/etag")).cache, "fresh again after revalidating").to.equal("hit");
      expect(hits("/etag")).to.equal(2);
    } finally {
      await server.close();
    }
  });

  test("revalidates no-cache responses every time", async () => {
    const { server, get, hits } = await setup();
    try {
      await get("/no-cache");
      const again = await get("/no-cache");
      expect(again.cache).to.equal("revalidated");
      expect(again.body).to.equal("always revalidated");
      expect(hits("/no-cache")).to.equal(2);
    } finally {
      await server.close();
    }
  });

  test("has the cache modes of Request.cache", async () => {
    const { server, get, advance, hits } = await setup();
    try {
      await expect(get("/max-age", { cache: "only-if-cached" })).rejects.toThrow(/isn't in the cache/);
      await get("/max-age");

      expect((await get("/max-age", { cache: "no-store" })).cache).to.equal("bypass");
      expect(hits("/max-age")).to.equal(2);

      expect((await get("/max-age", { cache: "reload" })).cache).to.equal("miss");
      expect(hits("/max-age")).to.equal(3);

      advance(3600);
      expect((await get("/max-age", { cache: "force-cache" })).cache).to.equal("hit");
      expect((await get("/max-age", { cache: "only-if-cached" })).cache).to.equal("hit");
      expect(hits("/max-age")).to.equal(3);

      await get("/etag");
      await get("/etag", { cache: "no-cache" });
      expect(server.requests.at(-1)?.headers["if-none-match"]).to.equal("\"v1\"");
    } finally {
      await server.close();
    }
  });

  test("a request that's already conditional bypasses the cache", async () => {
    const { server, get } = await setup();
    try {
      await get("/max-age");
      expect((await get("/max-age", { headers: { "if-none-match": "\"x\"" } })).cache).to.equal("bypass");
    } finally {
      await server.close();
    }
  });

  test("keeps a variant for each Vary", async () => {
    const { server, get, hits } = await setup();
    try {
      expect((await get("/vary", { headers: { "accept-language": "en" } })).body).to.equal("lang=en");
      expect((await get("/vary", { headers: { "accept-language": "fr" } })).body).to.equal("lang=fr");
      const english = await get("/vary", { headers: { "accept-language": "en" } });
      expect(english.body).to.equal("lang=en");
      expect(english.cache).to.equal("hit");
      expect(hits("/vary")).to.equal(2);
    } finally {
      await server.close();
    }
  });

  test("serves stale while it revalidates in the background, at low priority", async () => {
    const { server, get, advance, hits } = await setup();
    try {
      const first = await get("/swr");
      advance(5);
      const stale = await get("/swr");
      expect(stale.cache).to.equal("stale");
      expect(stale.body).to.equal(first.body);
      await settle();
      expect(hits("/swr"), "refreshed in the background").to.equal(2);
      const refreshed = await get("/swr");
      expect(refreshed.cache).to.equal("hit");
      expect(refreshed.body).not.to.equal(first.body);
    } finally {
      await server.close();
    }
  });

  test("follows max-age=0 and max-stale in the request", async () => {
    const { server, get, advance } = await setup();
    try {
      await get("/max-age");
      expect((await get("/max-age", { headers: { "cache-control": "max-age=0" } })).cache).to.equal("miss");
      advance(70);
      expect((await get("/max-age", { headers: { "cache-control": "max-stale=30" } })).cache).to.equal("stale");
    } finally {
      await server.close();
    }
  });

  test("a successful POST makes its URL's response stale", async () => {
    const { server, get } = await setup();
    try {
      await get("/item");
      expect((await get("/item")).cache).to.equal("hit");
      await get("/item", { method: "POST", body: "x" });
      expect((await get("/item")).cache).to.equal("miss");
    } finally {
      await server.close();
    }
  });

  test("purge removes a URL", async () => {
    const { server, cache, get } = await setup();
    try {
      await get("/max-age");
      await cache.purge(`${server.url}/max-age`);
      expect((await get("/max-age")).cache).to.equal("miss");
    } finally {
      await server.close();
    }
  });

  test("sessions on the same stack share it, like tabs", async () => {
    const { server, session, get, hits } = await setup();
    try {
      await get("/max-age");
      const tab = new Session(session.stack, { baseURL: server.url });
      expect(responseMeta(await tab.fetch("/max-age")).cache).to.equal("hit");
      expect(hits("/max-age")).to.equal(1);
    } finally {
      await server.close();
    }
  });

  test("doesn't store hop-by-hop headers", async () => {
    const { server, store, get } = await setup();
    try {
      await get("/hop-by-hop");
      const [entry] = await store.match(`${server.url}/hop-by-hop`);
      const stored = new Headers(entry.headers);
      for (const name of ["connection", "keep-alive", "transfer-encoding", "x-private-hop"]) {
        expect(stored.has(name), `${name} isn't stored`).to.equal(false);
      }
      expect(stored.get("x-kept")).to.equal("1");
      expect(stored.get("content-length")).to.equal("4");
    } finally {
      await server.close();
    }
  });

  test("a response the runtime reached by following a redirect isn't stored under the URL that was asked for", async () => {
    const { server, get, hits } = await setup();
    try {
      const first = await get("/temporary-to-fresh");
      expect(first.body).to.equal("item");
      expect(first.response.redirected, "the runtime followed it").to.equal(true);
      await get("/temporary-to-fresh");
      expect(hits("/temporary-to-fresh"), "the fresh response it ended at wasn't stored as the 302's").to.equal(2);
    } finally {
      await server.close();
    }
  });

  test("a store that fails never fails a request", async () => {
    /** @type string[] */
    const errors = [];
    /** @type CacheStore */
    const broken = {
      match: () => Promise.reject(Error("disk on fire")),
      put: () => Promise.reject(Error("disk full")),
      delete: () => Promise.reject(Error("read-only"))
    };
    const { server, cache, get } = await setup({
      store: broken,
      onStoreError: (error, operation) => errors.push(`${operation}: ${/** @type Error */ (error).message}`)
    });
    try {
      expect((await get("/max-age")).body).to.equal("cached for a minute");
      await get("/item", { method: "POST", body: "b" });
      await cache.purge(`${server.url}/item`);
      expect(errors).to.eql(["match: disk on fire", "put: disk full", "delete: read-only", "delete: read-only"]);
    } finally {
      await server.close();
    }
  });

  describe("heuristic lifetimes", () => {
    test("come from Last-Modified", async () => {
      const { server, get, advance } = await setup();
      try {
        await get("/heuristic");
        advance(50);
        expect((await get("/heuristic")).cache).to.equal("hit");
        advance(60);
        expect((await get("/heuristic")).cache).to.equal("miss");
      } finally {
        await server.close();
      }
    });

    test("are a day for permanent redirects", async () => {
      const { server, get, advance, hits } = await setup({ manual: true });
      try {
        for (const path of ["/moved", "/moved-308"]) {
          await get(path);
          advance(60 * 60);
          expect((await get(path)).cache).to.equal("hit");
          expect(hits(path)).to.equal(1);
        }
        advance(24 * 60 * 60);
        await get("/moved");
        expect(hits("/moved"), "fetched again after a day").to.equal(2);
      } finally {
        await server.close();
      }
    });

    test("aren't given to temporary redirects, which aren't stored", async () => {
      const { server, get, hits } = await setup({ manual: true });
      try {
        await get("/temporary");
        await get("/temporary");
        expect(hits("/temporary")).to.equal(2);
      } finally {
        await server.close();
      }
    });

    test("don't replace a lifetime the response says", async () => {
      const { server, get, hits } = await setup({ manual: true });
      try {
        await get("/moved-max-age-0");
        await get("/moved-max-age-0");
        expect(hits("/moved-max-age-0")).to.equal(2);
      } finally {
        await server.close();
      }
    });

    test("for a permanent redirect win over Last-Modified, and can be turned off", async () => {
      {
        const { server, get, advance, hits } = await setup({ manual: true });
        try {
          await get("/moved-old");
          advance(2 * 24 * 60 * 60);
          await get("/moved-old");
          expect(hits("/moved-old")).to.equal(2);
        } finally {
          await server.close();
        }
      }
      {
        const { server, get, advance, hits } = await setup({ manual: true, permanentRedirectLifetime: 0 });
        try {
          await get("/moved");
          await get("/moved");
          expect(hits("/moved"), "no lifetime without Last-Modified").to.equal(2);
          await get("/moved-old");
          advance(2 * 24 * 60 * 60);
          await get("/moved-old");
          expect(hits("/moved-old"), "back to Last-Modified").to.equal(1);
        } finally {
          await server.close();
        }
      }
    });

    test("can be the application's, asked first", async () => {
      const { server, get, advance, hits } = await setup({
        manual: true,
        heuristic: ({ status, url }) => status === 404 ? 60 : url.endsWith("/moved") ? 10 : undefined
      });
      try {
        await get("/missing");
        advance(30);
        const second = await get("/missing");
        expect(second.cache).to.equal("hit");
        expect(second.body).to.equal("not here");
        expect(hits("/missing")).to.equal(1);

        await get("/moved");
        advance(20);
        await get("/moved");
        expect(hits("/moved"), "10s instead of a day").to.equal(2);
      } finally {
        await server.close();
      }
    });
  });

  test("can be composed into a stack", async () => {
    const server = await startServer((request, response) => routes["/max-age"](request, response));
    try {
      const session = new Session(compose(httpCache())(defaultTransport()), { baseURL: server.url });
      await (await session.fetch("/a")).text();
      await settle();
      expect(responseMeta(await session.fetch("/a")).cache).to.equal("hit");
    } finally {
      await server.close();
    }
  });
});
