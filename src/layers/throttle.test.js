import { describe, test, expect } from "vitest";
import { Session } from "../session.js";
import { compose } from "../layers.js";
import { PriorityController } from "../priority.js";
import { responseMeta } from "../response-meta.js";
import { Throttle, throttle } from "./throttle.js";
import { scheduler } from "./scheduler.js";
import { controlled, tick } from "../test-helpers/controlled.js";

/**
 * @import { SessionFetchInit } from "../session.d.ts"
 * @import { ThrottleOptions } from "./throttle.d.ts"
 */

describe("the throttle", () => {
  test("lets maxDelayable low-priority requests run when nothing important is loading", async () => {
    const { net, go, finish } = page({ maxDelayable: 3 });
    for (const n of [1, 2, 3, 4, 5]) {
      go(`low-${n}`, "low");
    }
    await tick();
    expect(net.started).to.eql(["a.test/low-1", "a.test/low-2", "a.test/low-3"]);
    await finish("low-1");
    expect(net.started.at(-1)).to.equal("a.test/low-4");
    await finish("low-2", "low-3", "low-4", "low-5");
  });

  test("lets maxDelayableWhileBusy low-priority requests run while something important loads", async () => {
    const { net, layer, session, go, finish } = page({ maxDelayable: 10, maxDelayableWhileBusy: 1 });
    go("main.css", "high");
    go("analytics-1", "low");
    go("analytics-2", "low");
    go("analytics-3", "low");
    go("app.js");
    await tick();
    expect(net.started.toSorted(), "auto is important too").to.eql(["a.test/analytics-1", "a.test/app.js", "a.test/main.css"]);
    expect(layer.stats(session)).to.eql({ important: 2, delayable: 1, queued: 2 });

    await finish("analytics-1");
    expect(net.started.at(-1), "still busy, so one at a time").to.equal("a.test/analytics-2");

    await finish("main.css", "app.js");
    expect(net.started.at(-1), "nothing important left, so the rest go").to.equal("a.test/analytics-3");
    await finish("analytics-2", "analytics-3");
    expect(layer.stats(session)).to.eql({ important: 0, delayable: 0, queued: 0 });
  });

  test("a held request whose priority is raised starts right away", async () => {
    const { net, go, finish } = page();
    go("main.css", "high");
    go("busy-low", "low");
    const image = new PriorityController("low");
    go("image", image.signal);
    await tick();
    expect(net.started.toSorted()).to.eql(["a.test/busy-low", "a.test/main.css"]);
    image.set("high");
    await tick();
    expect(net.started.at(-1)).to.equal("a.test/image");
    await finish("main.css", "busy-low", "image");
  });

  test("by default, a frame's low-priority requests wait for its page's important ones", async () => {
    const { net, session, go, finish } = page();
    const frame = session.child();
    go("page.css", "high");
    go("page-low", "low");
    go("frame-low", "low", frame);
    await tick();
    expect(net.started.toSorted()).to.eql(["a.test/page-low", "a.test/page.css"]);
    await finish("page.css");
    expect(net.started.at(-1)).to.equal("a.test/frame-low");
    await finish("page-low", "frame-low");
  });

  test("with scope: session, each session is throttled by itself", async () => {
    const { net, session, go, finish } = page({ scope: "session" });
    const frame = session.child();
    go("page.css", "high");
    go("page-low", "low");
    go("frame-low", "low", frame);
    await tick();
    expect(net.started.toSorted()).to.eql(["a.test/frame-low", "a.test/page-low", "a.test/page.css"]);
    await finish("page.css", "page-low", "frame-low");
  });

  test("aborting a held request takes it out, and an error frees its place", async () => {
    const { net, layer, session, go, finish } = page({ maxDelayable: 1 });
    const first = session.fetch("https://a.test/first", { priority: "low" });
    const controller = new AbortController();
    const abandoned = session.fetch("https://a.test/abandoned", { priority: "low", signal: controller.signal });
    go("next", "low");
    await tick();
    controller.abort();
    await expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
    expect(layer.stats(session).queued).to.equal(1);

    net.fail("a.test/first");
    await expect(first).rejects.toThrow(/boom/);
    await tick();
    expect(net.started, "the aborted request never started").to.eql(["a.test/first", "a.test/next"]);
    await finish("next");
  });

  test("works with the scheduler, and marks what it did", async () => {
    const net = controlled();
    const session = new Session(compose(throttle(), scheduler({ perKey: 2 }))(net.transport));
    const css = session.fetch("https://a.test/css", { priority: "high" });
    const low1 = session.fetch("https://a.test/low-1", { priority: "low" });
    const low2 = session.fetch("https://a.test/low-2", { priority: "low" });
    const js = session.fetch("https://a.test/js");
    await tick();
    // The throttle lets one low through and holds low-2. The scheduler's two
    // slots go to the important requests, and low-1 waits there.
    expect(net.started.toSorted()).to.eql(["a.test/css", "a.test/js"]);

    /** @type (path: string, response: Promise<Response>) => Promise<void> */
    const done = async (path, response) => {
      net.answer(`a.test/${path}`);
      await (await response).text();
      await tick();
    };
    await done("css", css);
    expect(net.started.at(-1), "a slot freed up for the low request the throttle let through").to.equal("a.test/low-1");
    expect(net.started.length, "low-2 is still held, because js is loading").to.equal(3);
    await done("js", js);
    expect(net.started.at(-1), "nothing important left, so low-2 goes").to.equal("a.test/low-2");
    await done("low-1", low1);
    await done("low-2", low2);

    const marks = async (/** @type Promise<Response> */ response) => responseMeta(await response).record?.marks.map((mark) => mark.name);
    expect(await marks(low1)).to.eql(["scheduler:queued", "scheduler:start"]);
    expect(await marks(low2)).to.eql(["throttle:held", "throttle:released"]);
  });
});

/** @param {ThrottleOptions} [options] */
const page = (options = {}) => {
  const net = controlled();
  const layer = new Throttle(net.transport, options);
  const session = new Session(layer);
  /** @type Map<string, Promise<Response>> */
  const responses = new Map();
  /** @type (name: string, priority?: SessionFetchInit["priority"], from?: Session) => void */
  const go = (name, priority, from = session) => {
    responses.set(name, from.fetch(`https://a.test/${name}`, { priority }));
  };
  /** @type (...names: string[]) => Promise<void> */
  const finish = async (...names) => {
    for (const name of names) {
      net.answer(`a.test/${name}`);
      await (await /** @type Promise<Response> */ (responses.get(name))).text();
    }
    await tick();
  };
  return { net, layer, session, go, finish };
};
