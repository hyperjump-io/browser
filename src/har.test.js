import { describe, test, expect } from "vitest";
import validator from "har-validator";
import { Session } from "./session.js";
import { compose, fetcher } from "./layers.js";
import { defaultTransport } from "./transports/scheme-transport.js";
import { Trace } from "./trace.js";
import { destinationPriority } from "./layers/destination-priority.js";
import { dedupe } from "./layers/dedupe.js";
import { registry } from "./layers/registry.js";
import { scheduler } from "./layers/scheduler.js";
import { httpCache } from "./http-cache/http-cache.js";
import { controlled, tick } from "./test-helpers/controlled.js";
import { settle, startServer } from "./test-helpers/server.js";

/**
 * @import { Har } from "./har.d.ts"
 */

describe("HAR", () => {
  test("a page load is a valid HAR, with headers, sizes, types, and initiators", async () => {
    const server = await startServer((request, response) => {
      if (request.url === "/index.html") {
        response.setHeader("content-type", "text/html");
        response.end("<link rel=stylesheet href=main.css>");
        return;
      }
      const css = /** @type string */ (request.url).startsWith("/main.css");
      response.setHeader("content-type", css ? "text/css" : "image/png");
      response.end(css ? "body{}" : Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    try {
      const session = new Session(destinationPriority()(defaultTransport()), { baseURL: server.url, headers: { "/": { "user-agent": "browser-test" } } });
      const trace = new Trace(session, { bodies: true });
      const page = await session.fetch("/index.html", { destination: "document" });
      await page.text();
      await (await session.fetch("/main.css?v=2", { destination: "style", initiator: page })).text();
      await (await session.fetch("/logo.png", { destination: "image", initiator: page })).arrayBuffer();

      const har = trace.toHar();
      await valid(har);
      const [document, css, image] = har.log.entries;
      expect(har.log.pages[0].title).to.equal(`${server.url}/index.html`);
      expect(har.log.entries.every((entry) => entry.pageref === "page_1")).to.equal(true);

      expect(document._resourceType).to.equal("document");
      expect(document._priority).to.equal("High");
      expect(document.response.content.text).to.equal("<link rel=stylesheet href=main.css>");
      expect(document.response.content.size).to.equal(35);
      expect(document.request.headers).to.deep.include({ name: "user-agent", value: "browser-test" });

      expect(css._resourceType).to.equal("stylesheet");
      expect(css.request.queryString).to.eql([{ name: "v", value: "2" }]);
      expect(css._initiator).to.eql({ type: "other", url: `${server.url}/index.html` });

      expect(image._priority, "the priority the layers used").to.equal("Low");
      expect(image.response.content.encoding).to.equal("base64");
      expect(image.response.content.text).to.equal(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"));
      expect(image.response.content.mimeType).to.equal("image/png");

      for (const entry of har.log.entries) {
        const { blocked, send, wait, receive } = entry.timings;
        expect(Math.abs(entry.time - (blocked + send + wait + receive)), "time is the sum of the timings").to.be.lessThan(0.01);
        expect(Number.isNaN(Date.parse(entry.startedDateTime))).to.equal(false);
      }
    } finally {
      await server.close();
    }
  });

  test("bodies are left out unless the trace keeps them", async () => {
    const session = new Session(fetcher(() => new Response("secret", { headers: { "content-type": "text/plain" } })));
    const trace = new Trace(session);
    await (await session.fetch("https://a.test/x")).text();
    const har = trace.toHar();
    await valid(har);
    expect(har.log.entries[0].response.content.text).to.equal(undefined);
    expect(har.log.entries[0].response.content.size).to.equal(6);
  });

  test("each redirect is an entry", async () => {
    const steps = fetcher((request) => {
      const path = new URL(request.url).pathname;
      if (path === "/a") {
        return new Response(null, { status: 301, headers: { location: "/b" } });
      } else if (path === "/b") {
        return new Response(null, { status: 302, headers: { location: "/c" } });
      } else {
        return new Response("done", { headers: { "content-type": "text/plain" } });
      }
    });
    const session = new Session(steps);
    const trace = new Trace(session);
    await (await session.fetch("https://a.test/a")).text();
    const har = trace.toHar();
    await valid(har);
    expect(har.log.entries.map((entry) => [entry.request.url, entry.response.status, entry.response.redirectURL, entry._redirectHop ?? false])).to.eql([
      ["https://a.test/a", 301, "https://a.test/b", true],
      ["https://a.test/b", 302, "https://a.test/c", true],
      ["https://a.test/c", 200, "", false]
    ]);
  });

  test("waiting in the scheduler is blocked", async () => {
    const net = controlled();
    const session = new Session(scheduler({ perKey: 1 })(net.transport));
    const trace = new Trace(session);
    const first = session.fetch("https://a.test/1");
    const second = session.fetch("https://a.test/2");
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 30));
    net.answer("a.test/1");
    await (await first).text();
    await tick();
    net.answer("a.test/2");
    await (await second).text();

    const har = trace.toHar();
    await valid(har);
    expect(har.log.entries[0].timings.blocked).to.equal(0);
    expect(har.log.entries[1].timings.blocked).to.be.greaterThanOrEqual(25);
    expect(har.log.entries[1]._marks?.some((mark) => mark.name === "scheduler:queued")).to.equal(true);
  });

  test("waiting before a redirect is the first step's, and a request that joined another has the priority it was given", async () => {
    const net = controlled();
    const steps = fetcher((request, ctx) => new URL(request.url).pathname === "/old"
      ? new Response(null, { status: 301, headers: { location: "/new" } })
      : net.transport.fetch(request, ctx));
    const session = new Session(compose(destinationPriority(), dedupe(), scheduler({ perKey: 1 }))(steps));
    const trace = new Trace(session);
    const blocker = session.fetch("https://a.test/blocker");
    const moved = session.fetch("https://a.test/old");
    const css1 = session.fetch("https://a.test/c.css", { destination: "style" });
    const css2 = session.fetch("https://a.test/c.css", { destination: "style" });
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 30));

    /** @type (path: string, response: Promise<Response>) => Promise<void> */
    const step = async (path, response) => {
      net.answer(path);
      await (await response).text();
      await tick();
    };
    await step("a.test/blocker", blocker);
    expect(net.started.at(-1)).to.equal("a.test/c.css");
    await step("a.test/c.css", css1);
    await (await css2).text();
    expect(net.started.at(-1), "/old got the slot, and redirected to /new").to.equal("a.test/new");
    await step("a.test/new", moved);

    const har = trace.toHar();
    await valid(har);
    const firstStep = har.log.entries.find((entry) => entry.request.url === "https://a.test/old");
    expect(firstStep?.timings.blocked).to.be.greaterThanOrEqual(25);
    expect(har.log.entries.filter((entry) => entry.request.url === "https://a.test/c.css").map((entry) => entry._priority)).to.eql(["High", "High"]);
  });

  test("says what came from the cache and the registry, and what failed", async () => {
    const server = await startServer((_request, response) => {
      response.setHeader("cache-control", "max-age=60");
      response.end("cached");
    });
    try {
      const stack = compose(registry({ entries: { "https://pinned.test/a.json": "{}" } }), httpCache())(defaultTransport());
      const session = new Session(stack, { baseURL: server.url });
      const trace = new Trace(session);
      await (await session.fetch("/x")).text();
      await settle();
      await (await session.fetch("/x")).text();
      await (await session.fetch("https://pinned.test/a.json")).text();
      await expect(session.fetch("nope://x")).rejects.toThrow(TypeError);

      const har = trace.toHar();
      await valid(har);
      const [miss, hit, pinned, failed] = har.log.entries;
      expect([miss._source, miss._cache]).to.eql(["network", "miss"]);
      expect([hit._source, hit._cache]).to.eql(["http-cache", "hit"]);
      expect(pinned._source).to.equal("registry");
      expect(failed.response.status).to.equal(0);
      expect(failed._error).to.match(/isn't supported/);
    } finally {
      await server.close();
    }
  });

  test("an empty trace is a valid HAR", async () => {
    const har = new Trace(new Session()).toHar({ title: "nothing" });
    await valid(har);
    expect(har.log.entries).to.eql([]);
  });
});

/** @type (har: Har) => Promise<void> */
const valid = async (har) => {
  try {
    await validator.har(har);
  } catch (error) {
    expect.fail(`It isn't a valid HAR: ${JSON.stringify(/** @type {{ errors?: unknown }} */ (error).errors ?? error, null, 2)}`);
  }
};
