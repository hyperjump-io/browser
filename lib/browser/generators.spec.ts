import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, value, iter, keys, values, entries } from "../index.js";
import type { Browser } from "../index.js";


describe("JSON Browser", () => {
  describe("generators", () => {
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

    test("iter", async () => {
      const jref = `[1, { "$ref": "/external" }, { "$ref": "#/1" }]`;
      const external = "2";

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/subject" })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/external" })
        .reply(200, external, { headers: { "content-type": "application/reference+json" } });

      // Remove when caching is implemented
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/external" })
        .reply(200, external, { headers: { "content-type": "application/reference+json" } });

      const subject = await get(`${testDomain}/subject`);
      const generator = iter(subject);

      expect(value((await generator.next()).value as Browser)).to.equal(1);
      expect(value((await generator.next()).value as Browser)).to.equal(2);
      expect(value((await generator.next()).value as Browser)).to.equal(2);
      expect((await generator.next()).done).to.equal(true);
    });

    test("keys", async () => {
      const jref = `{
        "a": 1,
        "b": { "$ref": "/external" },
        "c": { "$ref": "#/1" }
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/subject" })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const subject = await get(`${testDomain}/subject`);
      const generator = keys(subject);

      expect(generator.next().value).to.equal("a");
      expect(generator.next().value).to.equal("b");
      expect(generator.next().value).to.equal("c");
      expect(generator.next().done).to.equal(true);
    });

    test("values", async () => {
      const jref = `{
        "a": 1,
        "b": { "$ref": "/external" },
        "c": { "$ref": "#/b" }
      }`;
      const external = "2";

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/subject" })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/external" })
        .reply(200, external, { headers: { "content-type": "application/reference+json" } });

      // Remove when caching is implemented
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/external" })
        .reply(200, external, { headers: { "content-type": "application/reference+json" } });

      const subject = await get(`${testDomain}/subject`);
      const generator = values(subject);

      expect(value((await generator.next()).value as Browser)).to.equal(1);
      expect(value((await generator.next()).value as Browser)).to.equal(2);
      expect(value((await generator.next()).value as Browser)).to.equal(2);
      expect((await generator.next()).done).to.equal(true);
    });

    test("entries", async () => {
      const jref = `{
        "a": 1,
        "b": { "$ref": "/external" },
        "c": { "$ref": "#/b" }
      }`;
      const external = "2";

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/subject" })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/external" })
        .reply(200, external, { headers: { "content-type": "application/reference+json" } });

      // Remove when caching is implemented
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/external" })
        .reply(200, external, { headers: { "content-type": "application/reference+json" } });

      const subject = await get(`${testDomain}/subject`);
      const generator = entries(subject);

      const a = (await generator.next()).value as [string, Browser];
      expect(a[0]).to.eql("a");
      expect(value(a[1])).to.eql(1);

      const b = (await generator.next()).value as [string, Browser];
      expect(b[0]).to.eql("b");
      expect(value(b[1])).to.eql(2);

      const c = (await generator.next()).value as [string, Browser];
      expect(c[0]).to.eql("c");
      expect(value(c[1])).to.eql(2);

      expect((await generator.next()).done).to.equal(true);
    });
  });
});
