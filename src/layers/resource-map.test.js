import { describe, test, expect } from "vitest";
import { Session } from "../session.js";
import { fetcher } from "../layers.js";
import { responseMeta } from "../response-meta.js";
import { ResourceMap } from "./resource-map.js";

const setup = (/** @type import("./resource-map.d.ts").ResourceMapOptions */ options = {}) => {
  let fetched = 0;
  const map = new ResourceMap(fetcher(() => {
    fetched++;
    return new Response("from below");
  }), options);
  return { map, page: new Session(map), fetched: () => fetched };
};

describe("the resource map", () => {
  test("answers a registered URL instead of fetching it, with its value", async () => {
    const { map, page, fetched } = setup();
    const value = { type: "string" };
    expect(map.register(page, "https://example.com/a.json#x", JSON.stringify(value), { value })).to.equal(true);

    const response = await page.fetch("https://example.com/a.json");
    expect(await response.json()).to.eql(value);
    expect(response.headers.get("content-type")).to.equal("application/json");
    expect(response.url).to.equal("https://example.com/a.json");
    expect(responseMeta(response).source).to.equal("resource-map");
    expect(responseMeta(response).value, "the same object").to.equal(value);
    expect(fetched()).to.equal(0);

    expect(await (await page.fetch("https://example.com/b.json")).text()).to.equal("from below");
  });

  test("a child sees its parent's resources, and its parent and siblings don't see its own", () => {
    const { map, page } = setup();
    const frameA = page.child();
    const frameB = page.child();
    map.register(page, "https://example.com/page", "p");
    map.register(frameA, "https://example.com/frame", "f");

    expect(map.lookup(frameA, "https://example.com/page")?.session).to.equal(page);
    expect(map.lookup(frameA, "https://example.com/frame")?.session).to.equal(frameA);
    expect(map.lookup(page, "https://example.com/frame")).to.equal(undefined);
    expect(map.lookup(frameB, "https://example.com/frame")).to.equal(undefined);
    expect([...map.urls(frameA)]).to.eql(["https://example.com/frame"]);
  });

  test("inherit: false keeps each session to its own", () => {
    const { map, page } = setup({ inherit: false });
    map.register(page, "https://example.com/page", "p");
    expect(map.lookup(page.child(), "https://example.com/page")).to.equal(undefined);
  });

  test("the same content again is fine, and different content is an error", () => {
    const { map, page } = setup();
    map.register(page, "https://example.com/a", { body: "a" });
    expect(map.register(page, "https://example.com/a", "a")).to.equal(false);
    expect(() => map.register(page, "https://example.com/a", "b")).toThrow(/already registered/);
  });

  test("a child can register a URL its parent has", () => {
    const { map, page } = setup();
    const frame = page.child();
    map.register(page, "https://example.com/a", "page's");
    map.register(frame, "https://example.com/a", "frame's");
    expect(map.lookup(frame, "https://example.com/a")?.entry).to.equal("frame's");
  });

  test("HEAD has no body, and other methods are passed on", async () => {
    const { map, page, fetched } = setup();
    map.register(page, "https://example.com/a", "a");
    expect((await page.fetch("https://example.com/a", { method: "HEAD" })).body).to.equal(null);
    await page.fetch("https://example.com/a", { method: "POST", body: "x" });
    expect(fetched()).to.equal(1);
  });
});
