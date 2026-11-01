import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump } from "./index.js";

/**
 * @import { JrefNode } from "./index.js"
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
    const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
    const session = hyperjump.session();

    /** @type JrefNode */
    let node;

    beforeEach(async () => {
      const jref = `{
        "foo": 42
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      node = await session.get(`${testDomain}/foo`);
    });

    test("true", () => {
      expect(session.has("foo", node)).to.eql(true);
    });

    test("false", () => {
      expect(session.has("bar", node)).to.eql(false);
    });
  });

  describe("value", () => {
    const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
    const session = hyperjump.session();

    beforeEach(() => {
      const jref = `{
        "array": [],
        "object": {}
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });
    });

    test("throws for an array", async () => {
      const node = await session.get(`${testDomain}/foo#/array`);
      expect(() => session.value(node)).to.throw();
    });

    test("throws for an object", async () => {
      const node = await session.get(`${testDomain}/foo#/object`);
      expect(() => session.value(node)).to.throw();
    });
  });
});
