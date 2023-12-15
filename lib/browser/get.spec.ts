import { describe, it, beforeEach, afterEach, expect } from "vitest";
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

    it("follow references", async () => {
      const path = "/foo";
      const fragment = "/bar";
      const href = "#/foo";
      const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const browser = await get(`${testDomain}${path}#${fragment}`);

      expect(browser.baseUri).to.equal(`${testDomain}${path}`);
      expect(browser.cursor).to.equal(href.slice(1));
      expect(browser.root).to.eql({ foo: 42, bar: new Reference(href) });
    });

    it("relative to browser", async () => {
      const path = "/foo";
      const href = "/bar";
      const foo = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
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

      expect(browser.baseUri).to.equal(`${testDomain}${href}`);
      expect(browser.cursor).to.equal("");
      expect(browser.root).to.eql("bar");
    });

    it("fragment-only relative to browser", async () => {
      const path = "/foo";
      const fragment = "/foo";
      const href = "#/foo";
      const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const context = await get(testDomain + path);
      const browser = await get(`#${fragment}`, context);

      expect(browser.baseUri).to.equal(testDomain + path);
      expect(browser.cursor).to.equal(href.slice(1));
      expect(browser.root).to.eql({ foo: 42, bar: new Reference(href) });
    });
  });
});
