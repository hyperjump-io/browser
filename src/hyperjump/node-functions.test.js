import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump, jrefObjectHas, jrefObjectKeys, jrefStep, jrefValue, jsonStep } from "./index.js";

/**
 * @import { FollowedNode } from "./index.js"
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

    /** @type FollowedNode */
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
      expect(jrefObjectHas("foo", node)).to.eql(true);
    });

    test("false", () => {
      expect(jrefObjectHas("bar", node)).to.eql(false);
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
      expect(() => jrefValue(node)).to.throw();
    });

    test("throws for an object", async () => {
      const node = await session.get(`${testDomain}/foo#/object`);
      expect(() => jrefValue(node)).to.throw();
    });
  });

  describe("a node from the JSON functions", () => {
    const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
    const session = hyperjump.session();

    beforeEach(() => {
      const jref = `{
        "foo": { "$ref": "#/bar" },
        "bar": { "baz": 42 }
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });
    });

    test("can be a reference, so the JRef functions don't take it without narrowing", async () => {
      const node = await session.get(`${testDomain}/foo`);
      const foo = jsonStep("foo", node);

      // @ts-expect-error A reference hasn't been followed
      expect([...jrefObjectKeys(foo)]).to.eql(["$ref"]);

      const bar = jsonStep("bar", node);
      if (bar.type !== "reference") {
        expect(jrefObjectHas("baz", bar)).to.equal(true);
        expect(jrefValue(await jrefStep(session, "baz", bar))).to.equal(42);
      }
    });
  });
});
