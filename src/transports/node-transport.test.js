import { describe, test, expect } from "vitest";
import { nodeTransport } from "./node-transport.js";
import { fetcher } from "../layers.js";
import { testHyperjump } from "../test-helpers/hyperjump.js";

const url = import.meta.url;

describe("the Node.js transport", () => {
  test("fetches file: URLs", async () => {
    const response = await testHyperjump(nodeTransport(), { allow: [url] }).fetch(url);
    expect(await response.text()).to.contain("the Node.js transport");
  });

  test("leaves out file: URLs when file is false", async () => {
    const fetching = testHyperjump(nodeTransport({ file: false }), { allow: [url] }).fetch(url);
    await expect(fetching).rejects.toMatchObject({ cause: { code: "ERR_UNKNOWN_URL_SCHEME" } });
  });

  test("adds schemes", async () => {
    const transport = nodeTransport({ schemes: { "a:": fetcher(() => new Response("a")) } });
    expect(await (await testHyperjump(transport, { allow: ["a:x"] }).fetch("a:x")).text()).to.equal("a");
  });

  test("a file: fetcher in schemes replaces its own", async () => {
    const transport = nodeTransport({ schemes: { "file:": fetcher(() => new Response("mine")) } });
    expect(await (await testHyperjump(transport, { allow: [url] }).fetch(url)).text()).to.equal("mine");
  });
});
