import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, has, length, typeOf } from "../index.js";

import type { Browser } from "../index.js";


describe("JSON Browser", () => {
  const testDomain = "https://example.com";
  let mockAgent: MockAgent;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  describe("object has property", () => {
    let browser: Browser;

    beforeEach(async () => {
      const jref = `{
        "foo": 42
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      browser = await get(`${testDomain}/foo`);
    });

    test("true", () => {
      expect(has("foo", browser)).to.eql(true);
    });

    test("false", () => {
      expect(has("bar", browser)).to.eql(false);
    });
  });

  test("length of array", async () => {
    const jref = `[42]`;

    mockAgent.get(testDomain)
      .intercept({ method: "GET", path: "/foo" })
      .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

    const uri = `${testDomain}/foo`;
    const browser = await get(uri);

    expect(length(browser)).to.eql(1);
  });

  describe("object has property", () => {
    beforeEach(() => {
      const jref = `{
        "null": null,
        "true": true,
        "false": false,
        "number": 42,
        "string": "foo",
        "array": [],
        "object": {}
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });
    });

    test("null", async () => {
      const browser = await get(`${testDomain}/foo#/null`);
      expect(typeOf(browser)).to.eql("null");
    });

    test("true", async () => {
      const browser = await get(`${testDomain}/foo#/true`);
      expect(typeOf(browser)).to.eql("boolean");
    });

    test("false", async () => {
      const browser = await get(`${testDomain}/foo#/false`);
      expect(typeOf(browser)).to.eql("boolean");
    });

    test("number", async () => {
      const browser = await get(`${testDomain}/foo#/number`);
      expect(typeOf(browser)).to.eql("number");
    });

    test("string", async () => {
      const browser = await get(`${testDomain}/foo#/string`);
      expect(typeOf(browser)).to.eql("string");
    });

    test("array", async () => {
      const browser = await get(`${testDomain}/foo#/array`);
      expect(typeOf(browser)).to.eql("array");
    });

    test("object", async () => {
      const browser = await get(`${testDomain}/foo#/object`);
      expect(typeOf(browser)).to.eql("object");
    });
  });
});
