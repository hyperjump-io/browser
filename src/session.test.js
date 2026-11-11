import { describe, test, expect } from "vitest";
import { Session } from "./session.js";
import { fetcher } from "./layers.js";
import { PriorityController } from "./priority.js";
import { responseMeta } from "./response-meta.js";
import { startServer } from "./test-helpers/server.js";

/**
 * @import { TraceEvent } from "./fetch-record.d.ts"
 */

describe("sessions", () => {
  test("relative URLs are resolved against the base URL, and so are headers' keys", async () => {
    const server = await startServer((request, response) => response.end(`${request.url} ${request.headers["user-agent"]}`));
    try {
      const session = new Session(undefined, { baseURL: `${server.url}/app/`, headers: { "./": { "user-agent": "browser-test" } } });
      const response = await session.fetch("page.html");
      expect(await response.text()).to.equal("/app/page.html browser-test");
      expect(responseMeta(response).source).to.equal("network");
    } finally {
      await server.close();
    }
  });

  test("headers go only to the URLs they're for, and a longer key wins", async () => {
    const session = new Session(fetcher((request) => new Response(`${request.headers.get("x-a")} ${request.headers.get("x-b")}`)), {
      headers: {
        "https://a.test": { "x-a": "origin", "x-b": "origin" },
        "https://a.test/api/": { "x-b": "api" },
        "https://a.test/one": { "x-a": "one" }
      }
    });
    expect(await (await session.fetch("https://a.test/page")).text()).to.equal("origin origin");
    expect(await (await session.fetch("https://a.test/api/x")).text()).to.equal("origin api");
    expect(await (await session.fetch("https://a.test/one")).text()).to.equal("one origin");
    expect(await (await session.fetch("https://a.test/one/two")).text(), "a key without / is only for itself").to.equal("origin origin");
    expect(await (await session.fetch("https://b.test/api/x")).text()).to.equal("null null");
  });

  test("a request's own headers win over the session's", async () => {
    const session = new Session(fetcher((request) => new Response(request.headers.get("x-a"))), { headers: { "https://a.test/": { "x-a": "default" } } });
    const response = await session.fetch("https://a.test/", { headers: { "x-a": "mine" } });
    expect(await response.text()).to.equal("mine");
    expect(responseMeta(response).record?.requestHeaders, "the record has the headers that were sent").to.eql([["x-a", "mine"]]);
  });

  test("a headers key that isn't a URL, or is relative without a base URL, throws", () => {
    expect(() => new Session(undefined, { headers: { "/api/": {} } })).to.throw(TypeError, /no base URL/);
    expect(() => new Session(undefined, { baseURL: "https://a.test/", headers: { "http://[": {} } })).to.throw(TypeError, /isn't a URL/);
  });

  test("closing a session aborts what's in flight and refuses new requests", async () => {
    const server = await startServer(() => {
      // Never responds
    });
    try {
      const session = new Session();
      const pending = session.fetch(server.url);
      setTimeout(() => session.close(), 20);
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await expect(session.fetch(server.url)).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      await server.close();
    }
  });

  test("the caller's signal aborts its request", async () => {
    const session = new Session(fetcher((_request, ctx) => new Promise((_resolve, reject) => {
      ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason));
    })));
    const controller = new AbortController();
    const pending = session.fetch("https://a.test/", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  test("state is made once per key and session", () => {
    const session = new Session();
    const key = {};
    let made = 0;
    session.state(key, () => ++made);
    expect(session.state(key, () => ++made)).to.equal(1);
    expect(new Session().state(key, () => "other")).to.equal("other");
  });

  test("layers get the priority and destination", async () => {
    /** @type string[] */
    const seen = [];
    const session = new Session(fetcher((_request, ctx) => {
      seen.push(`${ctx.priority.value} ${ctx.destination}`);
      return new Response("");
    }));
    await session.fetch("https://a.test/1");
    await session.fetch("https://a.test/2", { priority: "high", destination: "style" });
    const controller = new PriorityController("low");
    await session.fetch("https://a.test/3", { priority: controller.signal, destination: "image" });
    expect(seen).to.eql(["auto ", "high style", "low image"]);
  });

  describe("child sessions", () => {
    test("are like iframes", async () => {
      const echo = fetcher((request) => new Response(`${request.url} ${request.headers.get("accept-language")} ${request.headers.get("x-frame")}`));
      const page = new Session(echo, { baseURL: "https://site.test/docs/", headers: { "/": { "accept-language": "en" } } });
      const frame = page.child({ baseURL: "widgets/", headers: { "./": { "x-frame": "1" } } });

      expect(frame.stack).to.equal(page.stack);
      expect(frame.parent).to.equal(page);
      expect(await (await frame.fetch("a.json")).text()).to.equal("https://site.test/docs/widgets/a.json en 1");
      expect(await (await page.fetch("a.json")).text()).to.equal("https://site.test/docs/a.json en null");
    });

    test("a headers key replaces the same key of their parent's", async () => {
      const echo = fetcher((request) => new Response(`${request.headers.get("x-a")} ${request.headers.get("x-b")}`));
      const page = new Session(echo, { headers: { "https://a.test/": { "x-a": "page", "x-b": "page" } } });
      expect(await (await page.child({ headers: { "https://a.test": { "x-a": "frame" } } }).fetch("https://a.test/")).text()).to.equal("frame null");
      expect(await (await page.child({ headers: { "https://a.test/": {} } }).fetch("https://a.test/")).text(), "a child can take a URL's headers away").to.equal("null null");
    });

    test("have their own state", () => {
      const page = new Session();
      const frame = page.child();
      const key = {};
      page.state(key, () => "page");
      expect(frame.state(key, () => "frame")).to.equal("frame");
    });

    test("close when their parent does, but not the other way around", async () => {
      const page = new Session(fetcher(() => new Response("")));
      const frame = page.child();
      const other = page.child();
      other.close();
      expect(other.closed).to.equal(true);
      expect(page.closed).to.equal(false);
      page.close();
      expect(frame.closed).to.equal(true);
      await expect(frame.fetch("https://a.test/")).rejects.toMatchObject({ name: "AbortError" });
    });

    test("know their root and lineage", () => {
      const page = new Session();
      const frame = page.child();
      const nested = frame.child();
      expect(page.root).to.equal(page);
      expect(nested.root).to.equal(page);
      expect([...nested.lineage()]).to.eql([nested, frame, page]);
    });
  });

  describe("records", () => {
    test("every response has its record", async () => {
      const session = new Session(fetcher(() => new Response("")), { baseURL: "https://site.test/" });
      const page = await session.fetch("index.html", { destination: "document" });
      const css = await session.fetch("main.css", { destination: "style", initiator: page });

      const pageRecord = responseMeta(page).record;
      const cssRecord = responseMeta(css).record;
      expect(pageRecord?.url).to.equal("https://site.test/index.html");
      expect(pageRecord?.destination).to.equal("document");
      expect(pageRecord?.status).to.equal(200);
      expect(cssRecord?.initiator).to.equal(pageRecord);
      expect(cssRecord?.id).to.be.greaterThan(/** @type number */ (pageRecord?.id));
    });

    test("observers see the start, marks, response, and end, which waits for the body", async () => {
      const session = new Session(fetcher((_request, ctx) => {
        ctx.record.mark("test:mark");
        return new Response("body");
      }));
      /** @type string[] */
      const events = [];
      const stop = session.observe((/** @type TraceEvent */ event) => {
        events.push(event.type === "mark" ? `mark ${event.mark.name}` : event.type);
      });

      const response = await session.fetch("https://a.test/");
      expect(events).to.eql(["start", "mark test:mark", "response"]);
      await response.text();
      expect(events).to.eql(["start", "mark test:mark", "response", "end"]);
      expect(responseMeta(response).record?.bodySize).to.equal(4);

      stop();
      await (await session.fetch("https://a.test/")).text();
      expect(events.length, "nothing after stop").to.equal(4);
    });

    test("bodies are kept only when an observer asks for them", async () => {
      const session = new Session(fetcher(() => new Response("body")));
      session.observe(() => {});
      const plain = await session.fetch("https://a.test/");
      await plain.text();
      expect(responseMeta(plain).record?.body).to.equal(undefined);

      session.observe(() => {}, { bodies: true });
      const kept = await session.fetch("https://a.test/");
      await kept.text();
      expect(new TextDecoder().decode(responseMeta(kept).record?.body)).to.equal("body");
    });

    test("a failure is recorded with its error", async () => {
      const session = new Session(fetcher(() => Promise.reject(new TypeError("offline"))));
      /** @type TraceEvent[] */
      const events = [];
      session.observe((event) => events.push(event));
      await expect(session.fetch("https://a.test/")).rejects.toThrow("offline");
      const end = events.find((event) => event.type === "end");
      expect(end?.record.toJSON().error).to.match(/offline/);
    });

    test("a child's requests are seen by its parent's observers", async () => {
      const page = new Session(fetcher(() => new Response("")));
      /** @type string[] */
      const urls = [];
      page.observe((event) => {
        if (event.type === "start") {
          urls.push(event.record.url);
        }
      });
      await page.child().fetch("https://a.test/frame");
      expect(urls).to.eql(["https://a.test/frame"]);
    });
  });
});
