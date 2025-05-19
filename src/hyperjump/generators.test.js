import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump } from "./index.js";
import { toJson } from "../json/jsonast-util.js";


describe("JSON Browser", () => {
  describe("generators", () => {
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

    test("iter", async () => {
      const uri = `${testDomain}/subject`;
      const jref = `[1, { "$ref": "/external" }, { "$ref": "#/1" }]`;
      const external = "2";

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/subject" })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/external" })
        .reply(200, external, { headers: { "content-type": "application/reference+json" } });

      const hyperjump = new Hyperjump();
      const subject = await hyperjump.get(uri);
      const generator = hyperjump.iter(subject);

      const first = await generator.next();
      expect(first.value && toJson(first.value)).to.equal(`1`);
      const second = await generator.next();
      expect(second.value && toJson(second.value)).to.equal(`2`);
      const third = await generator.next();
      expect(third.value && toJson(third.value)).to.equal(`2`);
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

      const hyperjump = new Hyperjump();
      const subject = await hyperjump.get(`${testDomain}/subject`);
      const generator = hyperjump.keys(subject);

      expect(generator.next().value).to.equal("a");
      expect(generator.next().value).to.equal("b");
      expect(generator.next().value).to.equal("c");
      expect(generator.next().done).to.equal(true);
    });

    test("values", async () => {
      const uri = `${testDomain}/subject`;
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

      const hyperjump = new Hyperjump();
      const subject = await hyperjump.get(uri);
      const generator = hyperjump.values(subject);

      const first = await generator.next();
      expect(first.value && toJson(first.value)).to.equal(`1`);
      const second = await generator.next();
      expect(second.value && toJson(second.value)).to.equal(`2`);
      const third = await generator.next();
      expect(third.value && toJson(third.value)).to.equal(`2`);
      expect((await generator.next()).done).to.equal(true);
    });

    test("entries", async () => {
      const uri = `${testDomain}/subject`;
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

      const hyperjump = new Hyperjump();
      const subject = await hyperjump.get(uri);
      const generator = hyperjump.entries(subject);

      const a = await generator.next();
      expect(a.value && a.value[0]).to.equal("a");
      expect(a.value && toJson(a.value[1])).to.equal(`1`);

      const b = await generator.next();
      expect(b.value && b.value[0]).to.equal("b");
      expect(b.value && toJson(b.value[1])).to.equal(`2`);

      const c = await generator.next();
      expect(c.value && c.value[0]).to.equal("c");
      expect(c.value && toJson(c.value[1])).to.equal(`2`);

      expect((await generator.next()).done).to.equal(true);
    });
  });
});
