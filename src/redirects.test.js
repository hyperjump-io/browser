import { describe, test, expect } from "vitest";
import { fetcher, layer } from "./layers.js";
import { defaultTransport } from "./transports/scheme-transport.js";
import { nodeTransport } from "./transports/node-transport.js";
import { responseMeta } from "./response-meta.js";
import { httpCache } from "./http-cache/http-cache.js";
import { readBody, settle, startServer } from "./test-helpers/server.js";
import { testHyperjump } from "./test-helpers/hyperjump.js";

/**
 * @import { Hyperjump } from "./hyperjump.js"
 * @import { HyperjumpConfig } from "./hyperjump.d.ts"
 */

describe("redirects", () => {
  test("are followed one at a time, through the stack", async () => {
    const server = await redirectServer();
    try {
      const session = testHyperjump(defaultTransport(), { allow: [server.url] });
      const response = await session.fetch(`${server.url}/chain/1`);
      expect(response.status).to.equal(200);
      expect(response.redirected).to.equal(true);
      expect(response.url).to.equal(`${server.url}/final`);
      expect(responseMeta(response).redirects).to.eql([`${server.url}/chain/1`, `${server.url}/chain/2`, `${server.url}/final`]);
      expect((await response.json()).path).to.equal("/final");
      expect(responseMeta(response).record?.marks.filter((mark) => mark.name === "redirect").length).to.equal(2);
      expect(server.hits.get("/chain/1")).to.equal(1);
      expect(server.hits.get("/chain/2")).to.equal(1);
    } finally {
      await server.close();
    }
  });

  test("the HTTP cache stores the redirects themselves", async () => {
    const server = await redirectServer();
    try {
      const session = testHyperjump(httpCache()(defaultTransport()), { allow: [server.url] });
      await (await session.fetch(`${server.url}/r/301/target?cache`)).text();
      await settle();
      const again = await session.fetch(`${server.url}/r/301/target?cache`);
      expect((await again.json()).path).to.equal("/target");
      expect(server.hits.get("/r/301/target"), "the 301 came from the cache").to.equal(1);
      expect(server.hits.get("/target"), "the target isn't cacheable").to.equal(2);
    } finally {
      await server.close();
    }
  });

  test("a layer can answer with a redirect, and can answer where a redirect leads", async () => {
    const server = await redirectServer();
    try {
      const answers = layer((request, ctx, inner) => {
        switch (new URL(request.url).pathname) {
          case "/latest.json":
            return Promise.resolve(new Response(null, { status: 302, headers: { location: "/v2.json" } }));
          case "/v2.json":
            return Promise.resolve(new Response("{\"version\":2}"));
          case "/old-api":
            return Promise.resolve(new Response(null, { status: 308, headers: { location: "/api" } }));
          default:
            return inner.fetch(request, ctx);
        }
      });
      const session = testHyperjump(answers(defaultTransport()), { allow: [server.url] });

      const latest = await session.fetch(`${server.url}/latest.json`);
      expect(await latest.json()).to.eql({ version: 2 });
      expect(latest.url).to.equal(`${server.url}/v2.json`);

      expect(await (await session.fetch(`${server.url}/r/302/v2.json`)).json(), "a redirect from the network to a URL the layer answers").to.eql({ version: 2 });
      expect(server.hits.get("/v2.json")).to.equal(undefined);
      expect((await (await session.fetch(`${server.url}/old-api`)).json()).path).to.equal("/api");
    } finally {
      await server.close();
    }
  });

  test("change the method and body as the Fetch standard says", async () => {
    const server = await redirectServer();
    try {
      const session = testHyperjump(defaultTransport(), { allow: [server.url] });
      /** @type (status: number) => Promise<unknown> */
      const post = async (status) => (await session.fetch(`${server.url}/r/${status}/echo`, { method: "POST", body: "payload", headers: { "content-type": "text/plain" } })).json();

      for (const status of [301, 302, 303]) {
        expect(await post(status), `${status} makes a POST a GET without its body`).to.eql({ path: "/echo", method: "GET", body: "", contentType: null, authorization: null, cookie: null, proxyAuthorization: null, apiKey: null });
      }
      for (const status of [307, 308]) {
        expect(await post(status), `${status} sends the method and body again`).to.eql({ path: "/echo", method: "POST", body: "payload", contentType: "text/plain", authorization: null, cookie: null, proxyAuthorization: null, apiKey: null });
      }
      expect((await (await session.fetch(`${server.url}/r/302/echo`, { method: "PUT", body: "x" })).json()).method, "302 only changes POST").to.equal("PUT");
      expect((await (await session.fetch(`${server.url}/r/303/echo`, { method: "PUT", body: "x" })).json()).method, "303 changes anything but GET and HEAD").to.equal("GET");
    } finally {
      await server.close();
    }
  });

  test("Authorization, Cookie, and Proxy-Authorization aren't sent to another origin, like Node.js's fetch", async () => {
    const other = await redirectServer();
    const server = await redirectServer(() => other.url);
    try {
      const session = testHyperjump(defaultTransport(), { allow: [server.url, other.url] });
      const headers = { "authorization": "Bearer secret", "cookie": "session=secret", "proxy-authorization": "Basic secret", "x-api-key": "key" };
      const same = await (await session.fetch(`${server.url}/r/302/echo`, { headers })).json();
      expect(same, "to the same origin").to.include({ authorization: "Bearer secret", cookie: "session=secret", proxyAuthorization: "Basic secret", apiKey: "key" });
      const crossed = await session.fetch(`${server.url}/to-other`, { method: "POST", body: "b", headers });
      const json = await crossed.json();
      expect(json, "to another origin").to.include({ authorization: null, cookie: null, proxyAuthorization: null, apiKey: "key" });
      expect(json.body).to.equal("b");
      expect(crossed.url).to.equal(`${other.url}/echo`);
    } finally {
      await server.close();
      await other.close();
    }
  });

  test("each step gets the session's headers for its own URL", async () => {
    const other = await redirectServer();
    const server = await redirectServer(() => other.url);
    try {
      const session = testHyperjump(defaultTransport(), {
        allow: [server.url, other.url],
        headers: {
          [`${server.url}/`]: { "x-api-key": "server" },
          [`${server.url}/r/`]: { "x-api-key": "redirects" }
        }
      });
      expect((await (await session.fetch(`${server.url}/to-other`)).json()).apiKey, "a credential doesn't follow a redirect to another origin").to.equal(null);
      expect((await (await session.fetch(`${server.url}/r/302/echo`)).json()).apiKey, "a path's credential doesn't follow a redirect out of the path").to.equal("server");

      const both = testHyperjump(defaultTransport(), {
        allow: [server.url, other.url],
        headers: { [`${other.url}/`]: { "x-api-key": "other" } }
      });
      expect((await (await both.fetch(`${server.url}/to-other`)).json()).apiKey, "a redirect gets the credential for where it leads").to.equal("other");
    } finally {
      await server.close();
      await other.close();
    }
  });

  test("a headers function is called for each step, with its URL without the fragment", async () => {
    const server = await redirectServer();
    try {
      /** @type string[] */
      const urls = [];
      const session = testHyperjump(defaultTransport(), {
        allow: [server.url],
        headers: {
          [`${server.url}/`]: async (url) => {
            urls.push(url.href);
            return { "x-api-key": `token ${urls.length}` };
          }
        }
      });
      const response = await session.fetch(`${server.url}/chain/1#top`);
      expect((await response.json()).apiKey).to.equal("token 3");
      expect(urls).to.eql([`${server.url}/chain/1`, `${server.url}/chain/2`, `${server.url}/final`]);
    } finally {
      await server.close();
    }
  });

  test("redirect: error, manual, loops, a missing Location, and fragments", async () => {
    const server = await redirectServer();
    try {
      const session = testHyperjump(defaultTransport(), { allow: [server.url], maxRedirects: 5 });
      await expect(session.fetch(`${server.url}/r/302/echo`, { redirect: "error" })).rejects.toMatchObject({ cause: { code: "ERR_UNEXPECTED_REDIRECT" } });

      const manual = await session.fetch(`${server.url}/r/302/echo`, { redirect: "manual" });
      expect(manual.status).to.equal(302);
      expect(manual.headers.get("location")).to.equal("/echo");

      const looping = session.fetch(`${server.url}/loop`);
      await expect(looping).rejects.toThrow(/more than 5 times, the limit in 'maxRedirects'/);
      await expect(looping).rejects.toMatchObject({ cause: { code: "ERR_TOO_MANY_REDIRECTS" } });

      const noLocation = await session.fetch(`${server.url}/no-location`);
      expect(noLocation.status).to.equal(302);
      expect(await noLocation.text()).to.equal("no location");

      const withFragment = await session.fetch(`${server.url}/chain/1#section`);
      expect(responseMeta(withFragment).redirects?.at(-1)).to.equal(`${server.url}/final#section`);
      expect(withFragment.url, "a response's URL doesn't have a fragment").to.equal(`${server.url}/final`);
    } finally {
      await server.close();
    }
  });

  test("a Location that isn't a URL, or has a username or password, is a network error", async () => {
    const session = testHyperjump(fetcher((request) => new Response(null, {
      status: 302,
      headers: { location: request.url.endsWith("/bad") ? "http://[::1" : "https://user:secret@a.test/landed" }
    })));
    for (const [path, message] of [["/bad", /isn't a URL/], ["/credentials", /username or password/]]) {
      const fetching = session.fetch(`https://a.test${path}`);
      await expect(fetching).rejects.toBeInstanceOf(TypeError);
      await expect(fetching).rejects.toThrow(message);
      await expect(fetching).rejects.toMatchObject({ cause: { code: "ERR_INVALID_REDIRECT" } });
    }
  });

  test("a redirect a browser won't say the target of is sent again for the browser to follow, with its body", async () => {
    /** @type string[] */
    const sent = [];
    const session = testHyperjump(fetcher(async (request) => {
      sent.push(`${request.redirect} ${await request.text()}`);
      if (request.redirect === "manual") {
        // What a browser gives for a redirect with redirect: "manual"
        const response = new Response(null, { status: 200 });
        Object.defineProperty(response, "type", { value: "opaqueredirect" });
        return response;
      }
      return new Response("followed");
    }));
    const response = await session.fetch("https://a.test/form", { method: "POST", body: "payload" });
    expect(await response.text()).to.equal("followed");
    expect(sent).to.eql(["manual payload", "follow payload"]);
  });

  test("when following a redirect fails, the copy of the body is cancelled, so its source isn't held open", async () => {
    const session = testHyperjump(fetcher(async (request) => {
      await request.body?.cancel();
      return new Response(null, { status: 307, headers: { location: request.url.endsWith("/refused") ? "https://not-allowed.test/" : "/next" } });
    }));
    for (const [path, init] of /** @type [string, RequestInit][] */ ([["/error", { redirect: "error" }], ["/refused", {}]])) {
      let cancelled = false;
      const body = new ReadableStream({
        pull: (controller) => controller.enqueue(new TextEncoder().encode("chunk")),
        cancel: () => {
          cancelled = true;
        }
      });
      await expect(session.fetch(`https://a.test${path}`, { ...init, method: "POST", body, duplex: "half" })).rejects.toBeInstanceOf(TypeError);
      await settle();
      expect(cancelled, path).to.equal(true);
    }
  });

  test("a server can't send a request to file:, even when the transport has it", async () => {
    const server = await redirectServer();
    try {
      const session = testHyperjump(nodeTransport(), { allow: [server.url] });
      const fetching = session.fetch(`${server.url}/to-file`);
      await expect(fetching).rejects.toThrow(/A redirect can't lead to a file/);
      await expect(fetching).rejects.toMatchObject({ cause: { code: "ERR_UNSAFE_REDIRECT" } });
    } finally {
      await server.close();
    }
  });

  test("maxRedirects and redirectSchemes are the session's", async () => {
    const server = await redirectServer();
    try {
      /** @type (options: HyperjumpConfig) => Hyperjump */
      const session = (options) => testHyperjump(defaultTransport(), { allow: [server.url], ...options });
      await expect(session({ maxRedirects: 1 }).fetch(`${server.url}/chain/1`)).rejects.toThrow(/more than 1 times/);
      expect((await session({ maxRedirects: 2 }).fetch(`${server.url}/chain/1`)).status).to.equal(200);
      expect(await (await session({ redirectSchemes: ["http:", "data:"] }).fetch(`${server.url}/to-data`)).text()).to.equal("hi");
      const toData = session({ redirectSchemes: ["http:"] }).fetch(`${server.url}/to-data`);
      await expect(toData).rejects.toThrow(/Add the scheme to 'redirectSchemes'/);
      await expect(toData).rejects.toMatchObject({ cause: { code: "ERR_UNSAFE_REDIRECT" } });
    } finally {
      await server.close();
    }
  });

  test("redirectSchemes can't have file:, because a redirect can't lead to a file", () => {
    expect(() => testHyperjump(defaultTransport(), { redirectSchemes: ["http:", "https:", "file:"] })).toThrow(TypeError);
    expect(() => testHyperjump(defaultTransport(), { redirectSchemes: ["FILE:"] })).toThrow("'redirectSchemes' can't have file:");
  });
});

/**
 * A server whose paths are redirects: `/r/<status>/<path>` redirects to
 * `/<path>`, and anything else says what it got
 *
 * @param {() => string} [otherOrigin]
 */
const redirectServer = async (otherOrigin) => startServer(async (request, response) => {
  const url = new URL(/** @type string */ (request.url), "http://localhost");
  const body = await readBody(request);
  const match = /^\/r\/(\d{3})(\/.*)$/.exec(url.pathname);
  if (match) {
    response.writeHead(Number(match[1]), { location: match[2], ...url.searchParams.has("cache") ? { "cache-control": "max-age=600" } : {} });
    response.end("redirect body");
    return;
  }
  /** @type Record<string, string> */
  const locations = {
    "/chain/1": "/chain/2",
    "/chain/2": "../final",
    "/loop": "/loop",
    "/to-file": "file:///etc/hostname",
    "/to-data": "data:text/plain,hi"
  };
  if (url.pathname in locations) {
    response.writeHead(302, { location: locations[url.pathname] }).end();
    return;
  }
  if (url.pathname === "/no-location") {
    response.writeHead(302).end("no location");
    return;
  }
  if (url.pathname === "/to-other" && otherOrigin) {
    response.writeHead(307, { location: `${otherOrigin()}/echo` }).end();
    return;
  }
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({
    path: url.pathname,
    method: request.method,
    body,
    contentType: request.headers["content-type"] ?? null,
    authorization: request.headers.authorization ?? null,
    cookie: request.headers.cookie ?? null,
    proxyAuthorization: request.headers["proxy-authorization"] ?? null,
    apiKey: request.headers["x-api-key"] ?? null
  }));
});
