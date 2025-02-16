import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump } from "./index.js";

/**
 * @import { JsonCompatible } from "../json/index.js"
 * @import { JrefNode } from "../jref/index.js"
 */


describe("JSON Browser", () => {
  const testDomain = "https://example.com";
  /** @type MockAgent */
  let mockAgent;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  describe("object has property", () => {
    const hyperjump = new Hyperjump();

    /** @type JsonCompatible<JrefNode> */
    let node;

    beforeEach(async () => {
      const jref = `{
        "foo": 42
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      node = await hyperjump.get(`${testDomain}/foo`);
    });

    test("true", () => {
      expect(node && hyperjump.has("foo", node)).to.eql(true);
    });

    test("false", () => {
      expect(node && hyperjump.has("bar", node)).to.eql(false);
    });
  });

  test("length of array", async () => {
    const jref = `[42]`;

    mockAgent.get(testDomain)
      .intercept({ method: "GET", path: "/foo" })
      .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

    const hyperjump = new Hyperjump();
    const subject = await hyperjump.get(`${testDomain}/foo`);

    expect(hyperjump.length(subject)).to.eql(1);
  });

  describe("object has property", () => {
    const hyperjump = new Hyperjump();

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
      const subject = await hyperjump.get(`${testDomain}/foo#/null`);
      expect(hyperjump.typeOf(subject)).to.eql("null");
    });

    test("true", async () => {
      const subject = await hyperjump.get(`${testDomain}/foo#/true`);
      expect(hyperjump.typeOf(subject)).to.eql("boolean");
    });

    test("false", async () => {
      const subject = await hyperjump.get(`${testDomain}/foo#/false`);
      expect(hyperjump.typeOf(subject)).to.eql("boolean");
    });

    test("number", async () => {
      const subject = await hyperjump.get(`${testDomain}/foo#/number`);
      expect(hyperjump.typeOf(subject)).to.eql("number");
    });

    test("string", async () => {
      const subject = await hyperjump.get(`${testDomain}/foo#/string`);
      expect(hyperjump.typeOf(subject)).to.eql("string");
    });

    test("array", async () => {
      const subject = await hyperjump.get(`${testDomain}/foo#/array`);
      expect(hyperjump.typeOf(subject)).to.eql("array");
    });

    test("object", async () => {
      const subject = await hyperjump.get(`${testDomain}/foo#/object`);
      expect(hyperjump.typeOf(subject)).to.eql("object");
    });
  });
});
