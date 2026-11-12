import { describe, test, expect } from "vitest";
import { compose, findLayer } from "../layers.js";
import { defaultTransport } from "../transports/scheme-transport.js";
import { responseMeta } from "../response-meta.js";
import { Registry, registry } from "./registry.js";
import { startServer } from "../test-helpers/server.js";
import { testSession } from "../test-helpers/session.js";

describe("the registry", () => {
  test("answers first, passes on what it doesn't have, and is never written to", async () => {
    const server = await startServer((_request, response) => response.end("from the network"));
    try {
      const stack = registry({
        base: server.url,
        entries: {
          "/schema.json": "{\"type\":\"object\"}",
          "/gone": { status: 410, body: "gone" }
        },
        resolve: (url) => url.pathname.startsWith("/virtual/") ? `virtual ${url.pathname}` : undefined
      })(defaultTransport());
      const session = testSession(stack, { allow: [server.url] });

      const hit = await session.fetch(`${server.url}/schema.json#fragment`);
      expect(hit.headers.get("content-type")).to.equal("application/json");
      expect(await hit.json()).to.eql({ type: "object" });
      expect(responseMeta(hit).source).to.equal("registry");
      expect(hit.url, "a response's URL doesn't have a fragment").to.equal(`${server.url}/schema.json`);
      expect(await (await session.fetch(`${server.url}/schema.json`)).text(), "each request gets a new body").to.equal("{\"type\":\"object\"}");

      expect((await session.fetch(`${server.url}/gone`)).status).to.equal(410);
      expect(await (await session.fetch(`${server.url}/virtual/a`)).text()).to.equal("virtual /virtual/a");

      expect(await (await session.fetch(`${server.url}/other`)).text()).to.equal("from the network");
      expect(await (await session.fetch(`${server.url}/other`)).text()).to.equal("from the network");
      expect(server.hits.get("/other"), "what's passed on isn't added").to.equal(2);
      expect(server.hits.get("/schema.json")).to.equal(undefined);
    } finally {
      await server.close();
    }
  });

  test("onMiss: error lets only what's registered be fetched", async () => {
    const session = testSession(registry({ entries: { "https://a.test/x": "x" }, onMiss: "error" })(defaultTransport()));
    expect(await (await session.fetch("https://a.test/x")).text()).to.equal("x");
    await expect(session.fetch("https://a.test/y")).rejects.toMatchObject({ cause: { code: "ERR_NOT_IN_REGISTRY" } });
  });

  test("HEAD has no body", async () => {
    const session = testSession(registry({ entries: { "https://a.test/x": "x" } })(defaultTransport()));
    expect((await session.fetch("https://a.test/x", { method: "HEAD" })).body).to.equal(null);
  });

  test("an entry can be a function of the request", async () => {
    const session = testSession(registry({ entries: [["https://a.test/x", (request) => new Response(request.headers.get("x-a"))]] })(defaultTransport()));
    expect(await (await session.fetch("https://a.test/x", { headers: { "x-a": "1" } })).text()).to.equal("1");
  });

  test("has and urls tell what's registered", () => {
    const stack = compose(registry({ entries: { "https://a.test/x": "x" } }))(defaultTransport());
    const layer = findLayer(stack, Registry);
    expect(layer?.has("https://a.test/x#frag")).to.equal(true);
    expect(layer?.has("https://a.test/y")).to.equal(false);
    expect([...layer?.urls() ?? []]).to.eql(["https://a.test/x"]);
  });
});
