import { describe, test, expect } from "vitest";
import { fetcher } from "./layers.js";
import { responseMeta } from "./response-meta.js";
import { Hyperjump } from "./hyperjump.js";
import { Trace } from "./trace.js";
import { registry } from "./registry.js";

describe("registry", () => {
  const stack = fetcher((request) => new Response(`fetched ${request.url}`));

  test("its documents are answered before allowRetrieval and the stack", async () => {
    const session = new Hyperjump({ stack, allowRetrieval: [], registry: registry({ "https://a.test/doc": "registered" }) });
    const response = await session.fetch("https://a.test/doc#/a");

    expect(await response.text()).to.equal("registered");
    expect(response.url).to.equal("https://a.test/doc");
    expect(responseMeta(response).source).to.equal("registry");
  });

  test("a URL it doesn't have is fetched", async () => {
    const session = new Hyperjump({ stack, allowRetrieval: ["https://a.test/"], registry: registry({ "https://a.test/doc": "registered" }) });

    expect(await (await session.fetch("https://a.test/other")).text()).to.equal("fetched https://a.test/other");
  });

  test("a URL it doesn't have still has to be allowed", async () => {
    const session = new Hyperjump({ stack, allowRetrieval: [], registry: registry({ "https://a.test/doc": "registered" }) });

    await expect(session.fetch("https://a.test/other")).rejects.toThrow("isn't allowed");
  });

  test("only GET and HEAD are asked of it", async () => {
    const session = new Hyperjump({ stack, allowRetrieval: ["https://a.test/"], registry: registry({ "https://a.test/doc": "registered" }) });

    expect(await (await session.fetch("https://a.test/doc", { method: "POST" })).text()).to.equal("fetched https://a.test/doc");
  });

  test("what it throws is the fetch's error, and it's recorded", async () => {
    const session = new Hyperjump({
      stack,
      registry: { get: () => {
        throw Error("in the registry, but it can't be used");
      } }
    });
    const trace = new Trace(session);

    await expect(session.fetch("https://a.test/doc")).rejects.toThrow("can't be used");
    expect(trace.records.map((record) => record.url)).to.eql(["https://a.test/doc"]);
  });

  test("its answers are in a trace", async () => {
    const session = new Hyperjump({ stack, registry: registry({ "https://a.test/doc": "registered" }) });
    const trace = new Trace(session);
    await (await session.fetch("https://a.test/doc")).text();

    expect(trace.records.map((record) => [record.url, record.source])).to.eql([["https://a.test/doc", "registry"]]);
  });

  test("an entry can be the parts of a response, or a function that makes one each time", async () => {
    let made = 0;
    /** @type Hyperjump */
    const session = new Hyperjump({
      stack,
      registry: registry({
        "https://a.test/parts": { body: "{}", headers: { "content-type": "application/json" } },
        "https://a.test/made": (/** @type string */ url, /** @type import("./registry.d.ts").RegistryContext */ ctx) => {
          made++;
          return new Response(`${url} ${ctx.session === session}`);
        }
      })
    });

    expect((await session.fetch("https://a.test/parts")).headers.get("content-type")).to.equal("application/json");
    expect(await (await session.fetch("https://a.test/made")).text()).to.equal("https://a.test/made true");
    await session.fetch("https://a.test/made");
    expect(made).to.equal(2);
  });

  test("a relative URL is resolved against base, and entries are copied", () => {
    const entries = { "doc.json": "{}" };
    const registered = registry(entries, { base: "https://a.test/schemas/" });
    delete (/** @type Record<string, unknown> */ (entries))["doc.json"];

    expect(registered.get("https://a.test/schemas/doc.json", /** @type any */ ({}))).to.be.instanceOf(Response);
    expect(registered.get("https://a.test/doc.json", /** @type any */ ({}))).to.equal(undefined);
  });
});
