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
      expect(hyperjump.has("foo", node)).to.eql(true);
    });

    test("false", () => {
      expect(hyperjump.has("bar", node)).to.eql(false);
    });
  });

  describe("typeOf/value and type narrowing", () => {
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
      const node = await hyperjump.get(`${testDomain}/foo#/null`);
      if (hyperjump.typeOf(node, "null")) {
        /** @type null */
        const subject = hyperjump.value(node);
        expect(subject).to.equal(null);
      } else {
        expect.fail();
      }
    });

    test("true", async () => {
      const node = await hyperjump.get(`${testDomain}/foo#/true`);
      if (hyperjump.typeOf(node, "boolean")) {
        /** @type boolean */
        const subject = hyperjump.value(node);
        expect(subject).to.equal(true);
      } else {
        expect.fail();
      }
    });

    test("false", async () => {
      const node = await hyperjump.get(`${testDomain}/foo#/false`);
      if (hyperjump.typeOf(node, "boolean")) {
        /** @type boolean */
        const subject = hyperjump.value(node);
        expect(subject).to.equal(false);
      } else {
        expect.fail();
      }
    });

    test("number", async () => {
      const node = await hyperjump.get(`${testDomain}/foo#/number`);
      if (hyperjump.typeOf(node, "number")) {
        /** @type number */
        const subject = hyperjump.value(node);
        expect(subject).to.equal(42);
      } else {
        expect.fail();
      }
    });

    test("string", async () => {
      const node = await hyperjump.get(`${testDomain}/foo#/string`);
      if (hyperjump.typeOf(node, "string")) {
        /** @type string */
        const subject = hyperjump.value(node);
        expect(subject).to.equal("foo");
      } else {
        expect.fail();
      }
    });

    test("array", async () => {
      const node = await hyperjump.get(`${testDomain}/foo#/array`);
      expect(hyperjump.typeOf(node, "array")).to.equal(true);
      expect(() => hyperjump.value(node)).to.throw();
    });

    test("object", async () => {
      const node = await hyperjump.get(`${testDomain}/foo#/object`);
      expect(hyperjump.typeOf(node, "object")).to.equal(true);
      expect(() => hyperjump.value(node)).to.throw();
    });
  });
});
