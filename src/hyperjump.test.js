import { describe, test, expect } from "vitest";
import { getEventListeners } from "node:events";
import { join } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { fetcher } from "./layers.js";
import { PriorityController } from "./priority.js";
import { responseMeta, withUrl } from "./response-meta.js";
import { startServer } from "./test-helpers/server.js";
import { Hyperjump } from "./hyperjump.js";
import { testHyperjump } from "./test-helpers/hyperjump.js";

/**
 * @import { TraceEvent } from "./fetch-record.d.ts"
 */

describe("sessions", () => {
  test("relative URLs are resolved against the working directory, and so are headers' keys", async () => {
    const echo = fetcher((request) => new Response(`${request.url} ${request.headers.get("x-a")}`));
    const session = testHyperjump(echo, { allow: ["./"], headers: { "./": { "x-a": "local" } } });
    const response = await session.fetch("page.html");
    expect(await response.text()).to.equal(`${pathToFileURL(join(cwd(), "page.html")).href} local`);
  });

  test("headers go only to the URLs they're for, and a longer key wins", async () => {
    const session = testHyperjump(fetcher((request) => new Response(`${request.headers.get("x-a")} ${request.headers.get("x-b")}`)), {
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
    const session = testHyperjump(fetcher((request) => new Response(request.headers.get("x-a"))), { headers: { "https://a.test/": { "x-a": "default" } } });
    const response = await session.fetch("https://a.test/", { headers: { "x-a": "mine" } });
    expect(await response.text()).to.equal("mine");
    expect(responseMeta(response).record?.requestHeaders, "the record has the headers that were sent").to.eql([["x-a", "mine"]]);
  });

  test("a headers key that isn't a URL throws", () => {
    expect(() => testHyperjump(undefined, { headers: { "http://[": {} } })).to.throw(TypeError, /isn't a URL/);
  });

  test("closing a session aborts what's in flight and refuses new requests", async () => {
    const server = await startServer(() => {
      // Never responds
    });
    try {
      const session = testHyperjump(undefined, { allow: [server.url] });
      const pending = session.fetch(server.url);
      setTimeout(() => session.close(), 20);
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await expect(session.fetch(server.url)).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      await server.close();
    }
  });

  test("the caller's signal aborts its request", async () => {
    const session = testHyperjump(fetcher((request) => new Promise((_resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(request.signal.reason));
    })));
    const controller = new AbortController();
    const pending = session.fetch("https://a.test/", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  test("a configuration is a value that makes any number of sessions", async () => {
    const config = { stack: fetcher((request) => new Response(request.url)), allowRetrieval: ["https://a.test/"] };
    const first = new Hyperjump(config);
    const second = new Hyperjump({ ...config, allowRetrieval: ["https://b.test/"] });
    expect(second.stack).to.equal(first.stack);
    first.close();
    expect(second.closed).to.equal(false);
    expect(await (await second.fetch("https://b.test/x")).text()).to.equal("https://b.test/x");
    await expect(second.fetch("https://a.test/x")).rejects.toThrow(/isn't allowed/);
  });

  test("without a stack, it has the default stack, which reads files in Node.js", async () => {
    const response = await new Hyperjump().fetch("package.json");
    expect((await response.json()).name).to.equal("@hyperjump/browser");
  });

  test("an error says a file: URL relative to the working directory, and has the exact URL", async () => {
    const fetching = new Hyperjump().fetch("data/missing.json");
    await expect(fetching).rejects.toThrow("'data/missing.json' doesn't exist");
    await expect(fetching).rejects.toMatchObject({ url: pathToFileURL(join(cwd(), "data/missing.json")).href });
    await expect(new Hyperjump().fetch("../outside.json")).rejects.toThrow("Fetching '../outside.json' isn't allowed. Add it to 'allowRetrieval' to allow it.");
  });

  test("a response a fetcher made has the request's URL, without its fragment, as a fetched one does", async () => {
    const made = testHyperjump(fetcher(() => new Response("made")));
    expect((await made.fetch("https://a.test/doc#/a")).url).to.equal("https://a.test/doc");

    const given = testHyperjump(fetcher(() => withUrl(new Response("given"), "https://a.test/real")));
    expect((await given.fetch("https://a.test/doc")).url, "one with a URL keeps it").to.equal("https://a.test/real");
  });

  test("state is made once per key and session", () => {
    const session = testHyperjump();
    const key = {};
    let made = 0;
    session.state(key, () => ++made);
    expect(session.state(key, () => ++made)).to.equal(1);
    expect(testHyperjump().state(key, () => "other")).to.equal("other");
  });

  test("layers get the priority", async () => {
    /** @type string[] */
    const seen = [];
    const session = testHyperjump(fetcher((_request, ctx) => {
      seen.push(ctx.priority.value);
      return new Response("");
    }));
    await session.fetch("https://a.test/1");
    await session.fetch("https://a.test/2", { priority: "high" });
    const controller = new PriorityController("low");
    await session.fetch("https://a.test/3", { priority: controller.signal });
    expect(seen).to.eql(["auto", "high", "low"]);
  });

  describe("records", () => {
    test("every response has its record", async () => {
      const session = testHyperjump(fetcher(() => new Response("")));
      const page = await session.fetch("https://site.test/index.html");
      const css = await session.fetch("https://site.test/main.css", { initiator: page });

      const pageRecord = responseMeta(page).record;
      const cssRecord = responseMeta(css).record;
      expect(pageRecord?.url).to.equal("https://site.test/index.html");
      expect(pageRecord?.status).to.equal(200);
      expect(cssRecord?.initiator).to.equal(pageRecord);
      expect(cssRecord?.id).to.be.greaterThan(/** @type number */ (pageRecord?.id));
    });

    test("observers see the start, marks, response, and end, which waits for the body", async () => {
      const session = testHyperjump(fetcher((_request, ctx) => {
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

    test("requests don't listen to the session's signal, so a session's requests cost the same however many it has made", async () => {
      const session = testHyperjump(fetcher(() => new Response("body")));
      for (let index = 0; index < 100; index++) {
        await (await session.fetch(`https://a.test/${index}`)).text();
      }
      expect(getEventListeners(session.signal, "abort")).to.eql([]);
    });

    test("bodies are kept only when an observer asks for them", async () => {
      const session = testHyperjump(fetcher(() => new Response("body")));
      session.observe(() => {});
      const plain = await session.fetch("https://a.test/");
      await plain.text();
      expect(responseMeta(plain).record?.body).to.equal(undefined);

      session.observe(() => {}, { bodies: true });
      const kept = await session.fetch("https://a.test/");
      await kept.text();
      expect(new TextDecoder().decode(responseMeta(kept).record?.body)).to.equal("body");
    });

    test("a body that comes in chunks is kept whole, as its own copy", async () => {
      const encoder = new TextEncoder();
      const session = testHyperjump(fetcher(() => new Response(new ReadableStream({
        start: (controller) => {
          for (const part of ["one ", "two ", "three"]) {
            controller.enqueue(encoder.encode(part));
          }
          controller.close();
        }
      }))));
      session.observe(() => {}, { bodies: true });
      const response = await session.fetch("https://a.test/");
      const reader = /** @type ReadableStream<Uint8Array> */ (response.body).getReader();
      for (let read = await reader.read(); !read.done; read = await reader.read()) {
        read.value.fill(0);
      }
      expect(new TextDecoder().decode(responseMeta(response).record?.body)).to.equal("one two three");
    });

    test("a failure is recorded with its error", async () => {
      const session = testHyperjump(fetcher(() => Promise.reject(new TypeError("offline"))));
      /** @type TraceEvent[] */
      const events = [];
      session.observe((event) => events.push(event));
      await expect(session.fetch("https://a.test/")).rejects.toThrow("offline");
      const end = events.find((event) => event.type === "end");
      expect(end?.record.toJSON().error).to.match(/offline/);
    });
  });
});
