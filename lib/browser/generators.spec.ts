import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, value, iter, keys, values, entries } from "../index.js";
import type { Document } from "../index.js";


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

    it("iter", async () => {
      const jref = `[1, { "$href": "/external" }, { "$href": "#/1" }]`;
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

      expect(value((await generator.next()).value as Document)).to.equal(1);
      expect(value((await generator.next()).value as Document)).to.equal(2);
      expect(value((await generator.next()).value as Document)).to.equal(2);
      expect((await generator.next()).done).to.equal(true);
    });

    it("keys", async () => {
      const jref = `{
        "a": 1,
        "b": { "$href": "/external" },
        "c": { "$href": "#/1" }
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

    it("values", async () => {
      const jref = `{
        "a": 1,
        "b": { "$href": "/external" },
        "c": { "$href": "#/b" }
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

      expect(value((await generator.next()).value as Document)).to.equal(1);
      expect(value((await generator.next()).value as Document)).to.equal(2);
      expect(value((await generator.next()).value as Document)).to.equal(2);
      expect((await generator.next()).done).to.equal(true);
    });

    it("entries", async () => {
      const jref = `{
        "a": 1,
        "b": { "$href": "/external" },
        "c": { "$href": "#/b" }
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

      const a = (await generator.next()).value as [string, Document];
      expect(a[0]).to.eql("a");
      expect(value(a[1])).to.eql(1);

      const b = (await generator.next()).value as [string, Document];
      expect(b[0]).to.eql("b");
      expect(value(b[1])).to.eql(2);

      const c = (await generator.next()).value as [string, Document];
      expect(c[0]).to.eql("c");
      expect(value(c[1])).to.eql(2);

      expect((await generator.next()).done).to.equal(true);
    });
  });
});
