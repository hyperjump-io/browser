import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump } from "./index.js";


describe("JSON Browser", () => {
  describe("value", () => {
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

    test("full document", async () => {
      const path = "/foo";
      const jref = `42`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump();
      const uri = `${testDomain}${path}`;
      const subject = await browser.get(uri);

      expect(browser.value(/** @type NonNullable<any> */ (subject))).to.eql(42);
    });

    test("with pointer", async () => {
      const path = "/foo";
      const jref = `{ "foo": 42 }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump();
      const subject = await browser.get(`${testDomain}${path}#/foo`);

      expect(browser.value(/** @type NonNullable<any> */ (subject))).to.equal(42);
    });

    test("with pointer to reference", async () => {
      const path = "/foo";
      const jref = `{
        "foo": 42,
        "bar": { "$ref": "#/foo" }
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump();
      const subject = await browser.get(`${testDomain}${path}#/bar`);

      expect(browser.value(/** @type NonNullable<any> */ (subject))).to.equal(42);
    });
  });
});
