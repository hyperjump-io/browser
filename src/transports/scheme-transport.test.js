import { describe, test, expect } from "vitest";
import { createServer } from "node:net";
import { SchemeTransport, defaultTransport } from "./scheme-transport.js";
import { fetcher } from "../layers.js";
import { responseMeta } from "../response-meta.js";
import { testSession } from "../test-helpers/session.js";

describe("the scheme transport", () => {
  test("gives a request to the fetcher for its scheme", async () => {
    const transport = new SchemeTransport({ "a:": fetcher(() => new Response("a")) });
    expect(await (await testSession(transport, { allow: ["a:x", "b:x"] }).fetch("a:x")).text()).to.equal("a");
  });

  test("a scheme without a fetcher is a network error", async () => {
    const transport = new SchemeTransport({});
    const fetching = testSession(transport, { allow: ["a:x", "b:x"] }).fetch("a:x");
    await expect(fetching).rejects.toThrow(TypeError);
    await expect(fetching).rejects.toMatchObject({ cause: { code: "ERR_UNKNOWN_URL_SCHEME" } });
  });

  test("with adds and replaces schemes, and leaves the original alone", async () => {
    const original = new SchemeTransport({ "a:": fetcher(() => new Response("a")) });
    const changed = original.with({ "a:": fetcher(() => new Response("A")), "b:": fetcher(() => new Response("b")) });
    expect(await (await testSession(changed, { allow: ["a:x", "b:x"] }).fetch("a:x")).text()).to.equal("A");
    expect(await (await testSession(changed, { allow: ["a:x", "b:x"] }).fetch("b:x")).text()).to.equal("b");
    expect(await (await testSession(original, { allow: ["a:x", "b:x"] }).fetch("a:x")).text()).to.equal("a");
  });

  test("the default transport fetches data: URLs with fetch", async () => {
    const response = await testSession(defaultTransport()).fetch("data:text/plain,hi");
    expect(await response.text()).to.equal("hi");
    expect(responseMeta(response).source).to.equal("network");
  });

  test("the default transport doesn't fetch file: URLs", async () => {
    await expect(testSession(defaultTransport(), { allow: ["file:///etc/hostname"] }).fetch("file:///etc/hostname")).rejects.toThrow(/isn't supported/);
  });

  test("a failed fetch names its URL, and its cause is the runtime's", async () => {
    const url = `http://127.0.0.1:${await closedPort()}/a.json`;
    const fetching = testSession(defaultTransport(), { allow: [url] }).fetch(url);
    await expect(fetching).rejects.toThrow(TypeError);
    await expect(fetching).rejects.toThrow(`Failed to fetch '${url}': connect ECONNREFUSED`);
    await expect(fetching).rejects.toMatchObject({ cause: { code: "ECONNREFUSED" } });
  });

  test("an aborted fetch is given on as it is", async () => {
    const reason = new Error("stop");
    const fetching = testSession(defaultTransport(), { allow: ["http://127.0.0.1:1/"] }).fetch("http://127.0.0.1:1/a.json", { signal: AbortSignal.abort(reason) });
    await expect(fetching).rejects.toBe(reason);
  });
});

/** A port nothing listens on, from a server that's closed */
const closedPort = () => new Promise((resolve) => {
  const server = createServer();
  server.listen(0, "127.0.0.1", () => {
    const { port } = /** @type import("node:net").AddressInfo */ (server.address());
    server.close(() => resolve(port));
  });
});
