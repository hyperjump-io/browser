import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get } from "../index.js";
import { Reference } from "../jref/index.js";


describe("JSON Browser", () => {
  describe("get", () => {
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

    test("follow references", async () => {
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

      const browser = await get(`${testDomain}${path}#${fragment}`);

      expect(browser.uri).to.equal(`${testDomain}${path}${href}`);
      expect(browser.cursor).to.equal(href.slice(1));
      expect(browser.document.baseUri).to.equal(`${testDomain}${path}`);
      expect(browser.document.root).to.eql({ foo: 42, bar: new Reference(href) });
    });

    test("relative to browser", async () => {
      const path = "/foo";
      const href = "/bar";
      const foo = `{
  "foo": 42,
  "bar": { "$ref": "${href}" }
}`;
      const bar = `"bar"`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, foo, { headers: { "content-type": "application/reference+json" } });

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: href })
        .reply(200, bar, { headers: { "content-type": "application/reference+json" } });

      const context = await get(`${testDomain}${path}`);
      const browser = await get(href, context);

      expect(browser.uri).to.equal(`${testDomain}${href}`);
      expect(browser.cursor).to.equal("");
      expect(browser.document.baseUri).to.equal(`${testDomain}${href}`);
      expect(browser.document.root).to.eql("bar");
    });

    test("fragment-only relative to browser", async () => {
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

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const context = await get(testDomain + path);
      const browser = await get(`#${fragment}`, context);

      expect(browser.uri).to.equal(`${testDomain}${path}#${fragment}`);
      expect(browser.cursor).to.equal(href.slice(1));
      expect(browser.document.baseUri).to.equal(testDomain + path);
      expect(browser.document.root).to.eql({ foo: 42, bar: new Reference(href) });
    });
  });
});
