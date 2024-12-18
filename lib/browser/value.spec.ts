import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, value } from "../index.js";
import { Reference } from "../jref/index.js";


describe("JSON Browser", () => {
  describe("value", () => {
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

    test("full document", async () => {
      const path = "/foo";
      const href = "/bar";
      const jref = `{
        "foo": 42,
        "bar": { "$ref": "${href}" }
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const uri = `${testDomain}${path}`;
      const browser = await get(uri);

      expect(value(browser)).to.eql({ foo: 42, bar: new Reference(href) });
    });

    test("with pointer", async () => {
      const path = "/foo";
      const fragment = "/foo";
      const href = "#/foo";
      const jref = `{
        "foo": 42,
        "bar": { "$ref": "${href}" }
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const uri = `${testDomain}${path}#${fragment}`;
      const browser = await get(uri);

      expect(value(browser)).to.equal(42);
    });

    test("with pointer to reference", async () => {
      const path = "/foo";
      const fragment = "/bar";
      const href = "#/foo";
      const jref = `{
        "foo": 42,
        "bar": { "$ref": "${href}" }
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const uri = `${testDomain}${path}#${fragment}`;
      const browser = await get(uri);

      expect(value(browser)).to.equal(42);
    });
  });
});
