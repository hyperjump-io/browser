import { describe, test, expect } from "vitest";
import { Session } from "../session.js";
import { compose, fetcher } from "../layers.js";
import { PriorityController } from "../priority.js";
import { responseMeta } from "../response-meta.js";
import { HttpCache } from "../http-cache/http-cache.js";
import { Scheduler, scheduler } from "./scheduler.js";
import { dedupe } from "./dedupe.js";
import { controlled, tick } from "../test-helpers/controlled.js";

/**
 * @import { SessionFetchInit } from "../session.d.ts"
 */

describe("the scheduler", () => {
  test("limits requests in flight for each origin, without holding up other origins", async () => {
    const net = controlled();
    const layer = new Scheduler(net.transport, { perKey: 2 });
    const session = new Session(layer);

    const a = [1, 2, 3, 4].map((n) => session.fetch(`https://a.test/${n}`));
    const b = session.fetch("https://b.test/1");
    await tick();
    expect(net.started).to.eql(["a.test/1", "a.test/2", "b.test/1"]);
    expect(layer.stats().byKey["https://a.test"]).to.eql({ active: 2, queued: 2 });

    net.answer("a.test/1");
    await (await a[0]).text();
    await tick();
    expect(net.started.at(-1), "reading the body freed its slot").to.equal("a.test/3");

    for (const path of ["a.test/2", "a.test/3"]) {
      net.answer(path);
    }
    await Promise.all([a[1], a[2]].map(async (response) => (await response).text()));
    await tick();
    net.answer("a.test/4");
    net.answer("b.test/1");
    await Promise.all([a[3], b].map(async (response) => (await response).text()));
    expect(layer.stats()).to.eql({ active: 0, queued: 0, byKey: {} });
  });

  test("waiting requests start by priority, then in the order they came", async () => {
    const net = controlled();
    const session = new Session(scheduler({ perKey: 1 })(net.transport));
    const blocker = session.fetch("https://a.test/blocker");
    await tick();
    /** @type Record<string, Promise<Response>> */
    const waiting = {
      "low-1": session.fetch("https://a.test/low-1", { priority: "low" }),
      "auto-1": session.fetch("https://a.test/auto-1"),
      "high-1": session.fetch("https://a.test/high-1", { priority: "high" }),
      "low-2": session.fetch("https://a.test/low-2", { priority: "low" }),
      "high-2": session.fetch("https://a.test/high-2", { priority: "high" })
    };
    await finish(net, "a.test/blocker", blocker);
    for (const name of ["high-1", "high-2", "auto-1", "low-1", "low-2"]) {
      await finish(net, `a.test/${name}`, waiting[name]);
    }
    expect(net.started).to.eql(["a.test/blocker", "a.test/high-1", "a.test/high-2", "a.test/auto-1", "a.test/low-1", "a.test/low-2"]);
  });

  test("a slot is held until the body is read, cancelled, or fails, or until headers with releaseOn: headers", async () => {
    const net = controlled();
    const session = new Session(scheduler({ perKey: 1 })(net.transport));
    const first = session.fetch("https://a.test/1");
    const second = session.fetch("https://a.test/2");
    await tick();
    net.answer("a.test/1");
    const response = await first;
    await tick();
    expect(net.started, "the response arrived, but its body hasn't been read").to.eql(["a.test/1"]);
    await response.body?.cancel();
    await tick();
    expect(net.started, "cancelling the body freed its slot").to.eql(["a.test/1", "a.test/2"]);
    net.answer("a.test/2");
    await (await second).text();

    const eagerNet = controlled();
    const eager = new Session(scheduler({ perKey: 1, releaseOn: "headers" })(eagerNet.transport));
    const x = eager.fetch("https://a.test/x");
    const y = eager.fetch("https://a.test/y");
    await tick();
    eagerNet.answer("a.test/x");
    await x;
    await tick();
    expect(eagerNet.started).to.eql(["a.test/x", "a.test/y"]);
    eagerNet.answer("a.test/y");
    await (await y).text();
  });

  test("the wrapped response keeps its status and headers", async () => {
    const net = controlled();
    const session = new Session(scheduler()(net.transport));
    const pending = session.fetch("https://a.test/thing");
    await tick();
    net.answer("a.test/thing", "hello", { status: 201, headers: { "x-test": "1" } });
    const response = await pending;
    expect(response.status).to.equal(201);
    expect(response.headers.get("x-test")).to.equal("1");
    expect(await response.text()).to.equal("hello");
  });

  test("an error frees its slot, and aborting a waiting request takes it out of the queue", async () => {
    const net = controlled();
    const layer = new Scheduler(net.transport, { perKey: 1 });
    const session = new Session(layer);
    const failing = session.fetch("https://a.test/fails");
    const controller = new AbortController();
    const abandoned = session.fetch("https://a.test/abandoned", { signal: controller.signal });
    const next = session.fetch("https://a.test/next");
    await tick();
    expect(layer.stats().queued).to.equal(2);

    controller.abort();
    await expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
    expect(layer.stats().queued).to.equal(1);

    net.fail("a.test/fails");
    await expect(failing).rejects.toThrow(/boom/);
    await tick();
    expect(net.started, "the aborted request never started").to.eql(["a.test/fails", "a.test/next"]);
    net.answer("a.test/next");
    await (await next).text();
  });

  test("the total limit is for every origin, and other schemes aren't limited", async () => {
    const net = controlled();
    const session = new Session(scheduler({ perKey: 6, total: 2 })(net.transport));
    const requests = ["https://a.test/1", "https://b.test/1", "https://c.test/1"].map((url) => session.fetch(url));
    const data = session.fetch("data:text/plain,hi");
    await tick();
    expect(net.started.toSorted()).to.eql(["a.test/1", "b.test/1", "text/plain,hi"]);
    net.answer("a.test/1");
    await (await requests[0]).text();
    await tick();
    expect(net.started.at(-1)).to.equal("c.test/1");
    for (const path of ["b.test/1", "c.test/1", "text/plain,hi"]) {
      net.answer(path);
    }
    await Promise.all([requests[1], requests[2], data].map(async (response) => (await response).text()));
  });

  test("limits are shared by every session on the stack, like tabs", async () => {
    const net = controlled();
    const stack = scheduler({ perKey: 1 })(net.transport);
    const a = new Session(stack).fetch("https://a.test/1");
    const b = new Session(stack).fetch("https://a.test/2");
    await tick();
    expect(net.started).to.eql(["a.test/1"]);
    await finish(net, "a.test/1", a);
    await finish(net, "a.test/2", b);
  });

  test("a cache hit doesn't use a slot", async () => {
    const net = controlled();
    const session = new Session(compose((inner) => new HttpCache(inner))(scheduler({ perKey: 1 })(net.transport)));
    const first = session.fetch("https://a.test/cached");
    await tick();
    net.answer("a.test/cached", "body", { headers: { "cache-control": "max-age=60" } });
    await (await first).text();
    await tick();

    const blocker = session.fetch("https://a.test/blocker");
    await tick();
    const hit = await session.fetch("https://a.test/cached");
    expect(responseMeta(hit).cache).to.equal("hit");
    expect(await hit.text()).to.equal("body");
    await finish(net, "a.test/blocker", blocker);
  });

  test("a stale-while-revalidate refresh is low priority", async () => {
    /** @type string[] */
    const priorities = [];
    let now = Date.now();
    const transport = fetcher((_request, ctx) => {
      priorities.push(ctx.priority.value);
      return new Response(`v${priorities.length}`, {
        headers: { "cache-control": "max-age=1, stale-while-revalidate=60", "date": new Date(now).toUTCString() }
      });
    });
    const session = new Session(new HttpCache(transport, { now: () => now }));
    await (await session.fetch("https://a.test/x", { priority: "high" })).text();
    await tick();
    now += 5000;
    const stale = await session.fetch("https://a.test/x", { priority: "high" });
    expect(responseMeta(stale).cache).to.equal("stale");
    await stale.text();
    await tick();
    expect(priorities).to.eql(["high", "low"]);
  });

  describe("reprioritizing", () => {
    test("a waiting request can change priority, and keeps its arrival order among its new peers", async () => {
      const net = controlled();
      const session = new Session(scheduler({ perKey: 1 })(net.transport));
      /** @type Record<string, Promise<Response>> */
      const responses = {};
      /** @type (name: string, priority?: SessionFetchInit["priority"]) => void */
      const go = (name, priority) => {
        responses[name] = session.fetch(`https://a.test/${name}`, { priority });
      };

      go("blocker");
      await tick();
      const image = new PriorityController("low");
      go("low-early", "low");
      go("image", image.signal);
      go("auto");
      go("high", "high");

      // The image scrolls into view. It came before the other high request, so it goes first.
      image.set("high");
      await tick();
      for (const name of ["blocker", "image", "high", "auto", "low-early"]) {
        await finish(net, `a.test/${name}`, responses[name]);
      }
      expect(net.started).to.eql(["a.test/blocker", "a.test/image", "a.test/high", "a.test/auto", "a.test/low-early"]);
    });

    test("lowering a waiting request's priority moves it back, and changing it after it started does nothing", async () => {
      const net = controlled();
      const session = new Session(scheduler({ perKey: 1 })(net.transport));
      const blocker = session.fetch("https://a.test/blocker");
      await tick();
      const prefetch = new PriorityController("high");
      const later = session.fetch("https://a.test/prefetch", { priority: prefetch.signal });
      const auto = session.fetch("https://a.test/auto");
      prefetch.set("low");
      await finish(net, "a.test/blocker", blocker);
      await finish(net, "a.test/auto", auto);
      await finish(net, "a.test/prefetch", later);
      expect(net.started).to.eql(["a.test/blocker", "a.test/auto", "a.test/prefetch"]);
      prefetch.set("high");
    });

    test("dedupe gives a shared request the most urgent priority of the callers waiting", async () => {
      const net = controlled();
      const session = new Session(dedupe()(scheduler({ perKey: 1 })(net.transport)));
      const blocker = session.fetch("https://a.test/blocker");
      await tick();
      const low = session.fetch("https://a.test/shared", { priority: "low" });
      const auto = session.fetch("https://a.test/auto");
      const high = session.fetch("https://a.test/shared", { priority: "high" });
      await tick();
      await finish(net, "a.test/blocker", blocker);
      expect(net.started.at(-1), "the high caller moved it up").to.equal("a.test/shared");
      net.answer("a.test/shared");
      expect(await (await low).text()).to.equal("a.test/shared");
      expect(await (await high).text()).to.equal("a.test/shared");
      await tick();
      await finish(net, "a.test/auto", auto);
    });

    test("when the urgent caller gives up, the shared request goes back down", async () => {
      const net = controlled();
      const session = new Session(dedupe()(scheduler({ perKey: 1 })(net.transport)));
      const blocker = session.fetch("https://a.test/blocker");
      await tick();
      const low = session.fetch("https://a.test/shared", { priority: "low" });
      const auto = session.fetch("https://a.test/auto");
      await tick();
      const controller = new AbortController();
      const high = session.fetch("https://a.test/shared", { priority: "high", signal: controller.signal });
      await tick();
      controller.abort();
      await expect(high).rejects.toMatchObject({ name: "AbortError" });
      await finish(net, "a.test/blocker", blocker);
      expect(net.started.at(-1)).to.equal("a.test/auto");
      await finish(net, "a.test/auto", auto);
      await finish(net, "a.test/shared", low);
    });
  });
});

/**
 * Answer a request, read its body, and let what's waiting start
 *
 * @type (net: ReturnType<typeof controlled>, path: string, response: Promise<Response>) => Promise<void>
 */
const finish = async (net, path, response) => {
  net.answer(path);
  await (await response).text();
  await tick();
};
