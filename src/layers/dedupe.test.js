import { describe, test, expect } from "vitest";
import { Session } from "../session.js";
import { fetcher } from "../layers.js";
import { defaultTransport } from "../transports/scheme-transport.js";
import { responseMeta } from "../response-meta.js";
import { Dedupe, dedupe } from "./dedupe.js";
import { startServer } from "../test-helpers/server.js";
import { controlled, tick } from "../test-helpers/controlled.js";

describe("dedupe", () => {
  test("requests that are the same, made at the same time, are one request", async () => {
    const server = await startServer((_request, response) => setTimeout(() => response.end("shared body"), 30));
    try {
      const session = new Session(dedupe()(defaultTransport()));
      const responses = await Promise.all([1, 2, 3].map(() => session.fetch(`${server.url}/img.png`)));
      expect(await Promise.all(responses.map((response) => response.text()))).to.eql(["shared body", "shared body", "shared body"]);
      expect(server.hits.get("/img.png")).to.equal(1);
      expect(responseMeta(responses[1]).record?.marks.map((mark) => mark.name)).to.eql(["dedupe:joined"]);

      await (await session.fetch(`${server.url}/img.png`)).text();
      expect(server.hits.get("/img.png"), "not in flight any more, so fetched again").to.equal(2);
    } finally {
      await server.close();
    }
  });

  test("each session has its own requests in flight", async () => {
    const server = await startServer((_request, response) => setTimeout(() => response.end("ok"), 30));
    try {
      const stack = dedupe()(defaultTransport());
      await Promise.all([new Session(stack).fetch(`${server.url}/b`), new Session(stack).fetch(`${server.url}/b`)]);
      expect(server.hits.get("/b")).to.equal(2);
    } finally {
      await server.close();
    }
  });

  test("one caller aborting doesn't stop the others", async () => {
    const server = await startServer((_request, response) => setTimeout(() => response.end("ok"), 40));
    try {
      const session = new Session(dedupe()(defaultTransport()));
      const controller = new AbortController();
      const a = session.fetch(`${server.url}/x`, { signal: controller.signal });
      const b = session.fetch(`${server.url}/x`);
      controller.abort();
      await expect(a).rejects.toMatchObject({ name: "AbortError" });
      expect(await (await b).text()).to.equal("ok");
    } finally {
      await server.close();
    }
  });

  test("when every caller gives up, the request is stopped and the next caller starts a new one", async () => {
    /** @type AbortSignal[] */
    const signals = [];
    const net = controlled();
    const session = new Session(dedupe()(fetcher((request, ctx) => {
      signals.push(request.signal);
      return net.transport.fetch(request, ctx);
    })));
    const first = new AbortController();
    const second = new AbortController();
    const a = session.fetch("https://a.test/x", { signal: first.signal });
    const b = session.fetch("https://a.test/x", { signal: second.signal });
    await tick();
    first.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    expect(signals[0].aborted, "one caller is still waiting").to.equal(false);
    second.abort();
    await expect(b).rejects.toMatchObject({ name: "AbortError" });
    expect(signals[0].aborted).to.equal(true);

    const fresh = session.fetch("https://a.test/x");
    await tick();
    expect(signals.length, "a new request, not the one that was stopped").to.equal(2);
    net.answer("a.test/x");
    expect(await (await fresh).text()).to.equal("a.test/x");
  });

  describe("scope", () => {
    test("by default, a frame doesn't join its page's request", async () => {
      let calls = 0;
      const slow = fetcher(async () => {
        calls++;
        await tick();
        return new Response("ok");
      });
      const page = new Session(dedupe()(slow));
      await Promise.all([page.fetch("https://a.test/x"), page.child().fetch("https://a.test/x")].map(async (response) => (await response).text()));
      expect(calls).to.equal(2);
    });

    test("root shares requests between a page and its frames", async () => {
      const net = controlled();
      const layer = new Dedupe(net.transport, { scope: "root" });
      const page = new Session(layer);
      const frame = page.child();
      const a = page.fetch("https://a.test/x");
      const b = frame.fetch("https://a.test/x");
      await tick();
      expect(net.started).to.eql(["a.test/x"]);
      expect(layer.inFlight(frame), "the frame sees the page's request").to.equal(1);
      net.answer("a.test/x");
      const [responseA, responseB] = await Promise.all([a, b]);
      expect(await responseA.text()).to.equal(await responseB.text());
    });

    test("root: a frame that started a request can close without stopping it for the page", async () => {
      const net = controlled();
      const page = new Session(dedupe({ scope: "root" })(net.transport));
      const frame = page.child();
      const fromFrame = frame.fetch("https://a.test/x");
      const fromPage = page.fetch("https://a.test/x");
      await tick();
      frame.close();
      await expect(fromFrame).rejects.toMatchObject({ name: "AbortError" });
      net.answer("a.test/x");
      expect(await (await fromPage).text(), "the page still gets its response").to.equal("a.test/x");
    });

    test("root: the shared request has the page's signal, not the frame's", async () => {
      /** @type AbortSignal | undefined */
      let seen;
      const net = controlled();
      const page = new Session(dedupe({ scope: "root" })(fetcher((request, ctx) => {
        seen = request.signal;
        return net.transport.fetch(request, ctx);
      })));
      const frame = page.child();
      const pending = frame.fetch("https://a.test/y");
      await tick();
      frame.close();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(seen?.aborted, "with nobody else waiting, it was stopped").to.equal(true);
    });
  });
});
