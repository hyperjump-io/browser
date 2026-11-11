import { describe, test, expect } from "vitest";
import { compose, fetcher } from "../layers.js";
import { PriorityController } from "../priority.js";
import { destinationPriority } from "./destination-priority.js";
import { throttle } from "./throttle.js";
import { controlled, tick } from "../test-helpers/controlled.js";
import { testSession } from "../test-helpers/session.js";

describe("destination priority", () => {
  test("gives images low and styles high priority, unless the caller chose", async () => {
    /** @type Record<string, string> */
    const seen = {};
    const session = testSession(destinationPriority()(fetcher((request, ctx) => {
      seen[new URL(request.url).pathname] = ctx.priority.value;
      return new Response("");
    })));
    await session.fetch("https://a.test/hero.jpg", { destination: "image" });
    await session.fetch("https://a.test/lcp.jpg", { destination: "image", priority: "high" });
    await session.fetch("https://a.test/main.css", { destination: "style" });
    await session.fetch("https://a.test/data.json");
    await session.fetch("https://a.test/x", { destination: "constructor" });
    expect(seen).to.eql({ "/hero.jpg": "low", "/lcp.jpg": "high", "/main.css": "high", "/data.json": "auto", "/x": "auto" });
  });

  test("follows the caller's priority if it changes later", async () => {
    const net = controlled();
    /** @type import("../priority.d.ts").PrioritySignal | undefined */
    let seen;
    const session = testSession(destinationPriority()(fetcher((request, ctx) => {
      seen = ctx.priority;
      return net.transport.fetch(request, ctx);
    })));
    const controller = new PriorityController("auto");
    const pending = session.fetch("https://a.test/hero.jpg", { destination: "image", priority: controller.signal });
    await tick();
    expect(seen?.value).to.equal("low");
    controller.set("high");
    expect(seen?.value).to.equal("high");
    controller.set("auto");
    expect(seen?.value, "back to the destination's").to.equal("low");
    net.answer("a.test/hero.jpg");
    await (await pending).text();
  });

  test("can be given its own priorities", async () => {
    /** @type string | undefined */
    let seen;
    const session = testSession(destinationPriority({ json: "high" })(fetcher((_request, ctx) => {
      seen = ctx.priority.value;
      return new Response("");
    })));
    await session.fetch("https://a.test/a.json", { destination: "json" });
    expect(seen).to.equal("high");
  });

  test("with the throttle, images wait while the stylesheet loads", async () => {
    const net = controlled();
    const session = testSession(compose(destinationPriority(), throttle())(net.transport));
    const css = session.fetch("https://a.test/main.css", { destination: "style" });
    const images = [1, 2, 3].map((n) => session.fetch(`https://a.test/img-${n}.png`, { destination: "image" }));
    await tick();
    expect(net.started.toSorted(), "one image while the stylesheet loads").to.eql(["a.test/img-1.png", "a.test/main.css"]);
    net.answer("a.test/main.css");
    await (await css).text();
    await tick();
    expect(net.started.toSorted()).to.eql(["a.test/img-1.png", "a.test/img-2.png", "a.test/img-3.png", "a.test/main.css"]);
    for (const n of [1, 2, 3]) {
      net.answer(`a.test/img-${n}.png`);
      await (await images[n - 1]).text();
    }
  });
});
