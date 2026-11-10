import { describe, test, expect } from "vitest";
import { SchemeTransport, defaultTransport } from "./scheme-transport.js";
import { Session } from "../session.js";
import { fetcher } from "../layers.js";
import { responseMeta } from "../response-meta.js";

describe("the scheme transport", () => {
  test("gives a request to the fetcher for its scheme", async () => {
    const transport = new SchemeTransport({ "a:": fetcher(() => new Response("a")) });
    expect(await (await new Session(transport).fetch("a:x")).text()).to.equal("a");
  });

  test("a scheme without a fetcher is a network error", async () => {
    const transport = new SchemeTransport({});
    await expect(new Session(transport).fetch("a:x")).rejects.toThrow(TypeError);
  });

  test("with adds and replaces schemes, and leaves the original alone", async () => {
    const original = new SchemeTransport({ "a:": fetcher(() => new Response("a")) });
    const changed = original.with({ "a:": fetcher(() => new Response("A")), "b:": fetcher(() => new Response("b")) });
    expect(await (await new Session(changed).fetch("a:x")).text()).to.equal("A");
    expect(await (await new Session(changed).fetch("b:x")).text()).to.equal("b");
    expect(await (await new Session(original).fetch("a:x")).text()).to.equal("a");
  });

  test("the default transport fetches data: URLs with fetch", async () => {
    const response = await new Session(defaultTransport()).fetch("data:text/plain,hi");
    expect(await response.text()).to.equal("hi");
    expect(responseMeta(response).source).to.equal("network");
  });

  test("the default transport doesn't fetch file: URLs", async () => {
    await expect(new Session(defaultTransport()).fetch("file:///etc/hostname")).rejects.toThrow(/isn't supported/);
  });
});
