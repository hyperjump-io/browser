import { describe, test, expect } from "vitest";
import { Session } from "../session.js";
import { fetcher } from "../layers.js";
import { responseMeta } from "../response-meta.js";
import { ResourceMap } from "./resource-map.js";

describe("the resource map", () => {
  test("answers a URL registered in the document that caused the request, with its value", async () => {
    const { map, session, fetched } = setup();
    const bundle = await session.fetch("https://example.com/bundle");
    const value = { type: "string" };
    expect(map.register(bundle, "https://example.com/a.json#x", JSON.stringify(value), { value })).to.equal(true);

    const response = await session.fetch("https://example.com/a.json", { initiator: bundle });
    expect(await response.json()).to.eql(value);
    expect(response.headers.get("content-type")).to.equal("application/json");
    expect(response.url).to.equal("https://example.com/a.json");
    expect(responseMeta(response).source).to.equal("resource-map");
    expect(responseMeta(response).value, "the same object").to.equal(value);
    expect(fetched()).to.eql(["https://example.com/bundle"]);
  });

  test("a request the document didn't cause is fetched", async () => {
    const { map, session } = setup();
    const bundle = await session.fetch("https://example.com/bundle");
    const other = await session.fetch("https://example.com/other");
    map.register(bundle, "https://trusted.example/a", "the bundle's");

    expect(await (await session.fetch("https://trusted.example/a")).text(), "without an initiator").to.equal("from https://trusted.example/a");
    expect(await (await session.fetch("https://trusted.example/a", { initiator: other })).text(), "from another document").to.equal("from https://trusted.example/a");
  });

  test("a resource found in a document finds the others it contains", async () => {
    const { map, session } = setup();
    const bundle = await session.fetch("https://example.com/bundle");
    map.register(bundle, "https://example.com/a", "a");
    map.register(bundle, "https://example.com/b", "b");

    const a = await session.fetch("https://example.com/a", { initiator: bundle });
    expect(await (await session.fetch("https://example.com/b", { initiator: a })).text()).to.equal("b");

    map.register(a, "https://example.com/nested", "nested");
    expect(map.lookup(bundle, "https://example.com/nested")?.entry, "registered in the same set").to.equal("nested");
  });

  test("a document a bundle refers to doesn't find what the bundle contains", async () => {
    const { map, session } = setup();
    const bundle = await session.fetch("https://example.com/bundle");
    map.register(bundle, "https://example.com/a", "the bundle's");

    const referred = await session.fetch("https://example.com/other", { initiator: bundle });
    expect(await (await session.fetch("https://example.com/a", { initiator: referred })).text()).to.equal("from https://example.com/a");
  });

  test("each document has its own resources, even for the same URL", async () => {
    const { map, session } = setup();
    const first = await session.fetch("https://example.com/bundle");
    const second = await session.fetch("https://example.com/bundle");
    map.register(first, "https://example.com/a", "first's");
    map.register(second, "https://example.com/a", "second's");

    expect(map.lookup(first, "https://example.com/a")?.entry).to.equal("first's");
    expect(map.lookup(second, "https://example.com/a")?.entry).to.equal("second's");
    expect([...map.urls(first)]).to.eql(["https://example.com/a"]);
  });

  test("a request in another session finds what the document that caused it contains", async () => {
    const { map, session } = setup();
    const bundle = await session.fetch("https://example.com/bundle");
    map.register(bundle, "https://example.com/a", "a");
    expect(await (await session.child().fetch("https://example.com/a", { initiator: bundle })).text()).to.equal("a");
  });

  test("the same content again is fine, and different content is an error", async () => {
    const { map, session } = setup();
    const bundle = await session.fetch("https://example.com/bundle");
    map.register(bundle, "https://example.com/a", { body: "a" });
    expect(map.register(bundle, "https://example.com/a", "a")).to.equal(false);
    expect(() => map.register(bundle, "https://example.com/a", "b")).toThrow(/already registered/);
  });

  test("a response that isn't from a session can't contain resources", () => {
    const { map } = setup();
    expect(() => map.register(new Response("x"), "https://example.com/a", "a")).toThrow(TypeError);
    expect(map.lookup(new Response("x"), "https://example.com/a")).to.equal(undefined);
  });

  test("HEAD has no body, and other methods are passed on", async () => {
    const { map, session, fetched } = setup();
    const bundle = await session.fetch("https://example.com/bundle");
    map.register(bundle, "https://example.com/a", "a");
    expect((await session.fetch("https://example.com/a", { method: "HEAD", initiator: bundle })).body).to.equal(null);
    await session.fetch("https://example.com/a", { method: "POST", body: "x", initiator: bundle });
    expect(fetched()).to.eql(["https://example.com/bundle", "https://example.com/a"]);
  });
});

const setup = () => {
  /** @type string[] */
  const fetched = [];
  const map = new ResourceMap(fetcher((request) => {
    fetched.push(request.url);
    return new Response(`from ${request.url}`);
  }));
  return { map, session: new Session(map), fetched: () => fetched };
};
