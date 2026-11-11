import { describe, test, expect } from "vitest";
import { Session } from "./session.js";
import { compose } from "./layers.js";
import { defaultTransport } from "./transports/scheme-transport.js";
import { nodeTransport } from "./transports/node-transport.js";
import { responseMeta } from "./response-meta.js";
import { httpCache } from "./http-cache/http-cache.js";
import { registry } from "./layers/registry.js";
import { readBody, settle, startServer } from "./test-helpers/server.js";

describe("redirects", () => {
  test("are followed one at a time, through the stack", async () => {
    const server = await redirectServer();
    try {
      const session = new Session(defaultTransport(), { baseURL: server.url });
      const response = await session.fetch("/chain/1");
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
      const session = new Session(httpCache()(defaultTransport()), { baseURL: server.url });
      await (await session.fetch("/r/301/target?cache")).text();
      await settle();
      const again = await session.fetch("/r/301/target?cache");
      expect((await again.json()).path).to.equal("/target");
      expect(server.hits.get("/r/301/target"), "the 301 came from the cache").to.equal(1);
      expect(server.hits.get("/target"), "the target isn't cacheable").to.equal(2);
    } finally {
      await server.close();
    }
  });

  test("a registry entry can be a redirect, and can answer where a redirect leads", async () => {
    const server = await redirectServer();
    try {
      const stack = compose(
        registry({
          base: server.url,
          entries: {
            "/latest.json": { status: 302, headers: { location: "/v2.json" } },
            "/v2.json": "{\"version\":2}",
            "/old-api": { status: 308, headers: { location: "/api" } }
          }
        })
      )(defaultTransport());
      const session = new Session(stack, { baseURL: server.url });

      const latest = await session.fetch("/latest.json");
      expect(await latest.json()).to.eql({ version: 2 });
      expect(latest.url).to.equal(`${server.url}/v2.json`);
      expect(responseMeta(latest).source).to.equal("registry");

      expect(await (await session.fetch("/r/302/v2.json")).json(), "a redirect from the network to a registered URL").to.eql({ version: 2 });
      expect(server.hits.get("/v2.json")).to.equal(undefined);
      expect((await (await session.fetch("/old-api")).json()).path).to.equal("/api");
    } finally {
      await server.close();
    }
  });

  test("change the method and body as the Fetch standard says", async () => {
    const server = await redirectServer();
    try {
      const session = new Session(defaultTransport(), { baseURL: server.url });
      /** @type (status: number) => Promise<unknown> */
      const post = async (status) => (await session.fetch(`/r/${status}/echo`, { method: "POST", body: "payload", headers: { "content-type": "text/plain" } })).json();

      for (const status of [301, 302, 303]) {
        expect(await post(status), `${status} makes a POST a GET without its body`).to.eql({ path: "/echo", method: "GET", body: "", contentType: null, authorization: null });
      }
      for (const status of [307, 308]) {
        expect(await post(status), `${status} sends the method and body again`).to.eql({ path: "/echo", method: "POST", body: "payload", contentType: "text/plain", authorization: null });
      }
      expect((await (await session.fetch("/r/302/echo", { method: "PUT", body: "x" })).json()).method, "302 only changes POST").to.equal("PUT");
      expect((await (await session.fetch("/r/303/echo", { method: "PUT", body: "x" })).json()).method, "303 changes anything but GET and HEAD").to.equal("GET");
    } finally {
      await server.close();
    }
  });

  test("Authorization isn't sent to another origin", async () => {
    const other = await redirectServer();
    const server = await redirectServer(() => other.url);
    try {
      const session = new Session(defaultTransport(), { baseURL: server.url });
      const headers = { authorization: "Bearer secret" };
      expect((await (await session.fetch("/r/302/echo", { headers })).json()).authorization).to.equal("Bearer secret");
      const crossed = await session.fetch("/to-other", { method: "POST", body: "b", headers });
      const json = await crossed.json();
      expect(json.authorization).to.equal(null);
      expect(json.body).to.equal("b");
      expect(crossed.url).to.equal(`${other.url}/echo`);
    } finally {
      await server.close();
      await other.close();
    }
  });

  test("redirect: error, manual, loops, a missing Location, and fragments", async () => {
    const server = await redirectServer();
    try {
      const session = new Session(defaultTransport(), { baseURL: server.url, maxRedirects: 5 });
      await expect(session.fetch("/r/302/echo", { redirect: "error" })).rejects.toThrow(TypeError);

      const manual = await session.fetch("/r/302/echo", { redirect: "manual" });
      expect(manual.status).to.equal(302);
      expect(manual.headers.get("location")).to.equal("/echo");

      await expect(session.fetch("/loop")).rejects.toThrow(/more than 5 times/);

      const noLocation = await session.fetch("/no-location");
      expect(noLocation.status).to.equal(302);
      expect(await noLocation.text()).to.equal("no location");

      const withFragment = await session.fetch("/chain/1#section");
      expect(responseMeta(withFragment).redirects?.at(-1)).to.equal(`${server.url}/final#section`);
      expect(withFragment.url, "a response's URL doesn't have a fragment").to.equal(`${server.url}/final`);
    } finally {
      await server.close();
    }
  });

  test("a server can't send a request to file:, even when the transport has it", async () => {
    const server = await redirectServer();
    try {
      const session = new Session(nodeTransport(), { baseURL: server.url });
      await expect(session.fetch("/to-file")).rejects.toThrow(/isn't allowed/);
    } finally {
      await server.close();
    }
  });

  test("a child session has its parent's redirect options unless it's given its own", async () => {
    const server = await redirectServer();
    try {
      const parent = new Session(defaultTransport(), { baseURL: server.url, maxRedirects: 1, redirectSchemes: ["http:", "data:"] });
      await expect(parent.child().fetch("/chain/1")).rejects.toThrow(/more than 1 times/);
      expect(await (await parent.child().fetch("/to-data")).text()).to.equal("hi");
      expect((await parent.child({ maxRedirects: 2 }).fetch("/chain/1")).status).to.equal(200);
      await expect(parent.child({ redirectSchemes: ["http:"] }).fetch("/to-data")).rejects.toThrow(/isn't allowed/);
    } finally {
      await server.close();
    }
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
    authorization: request.headers.authorization ?? null
  }));
});
