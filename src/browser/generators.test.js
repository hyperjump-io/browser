import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump } from "./index.js";
import { toJref } from "../jref/jref-util.js";

/**
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { JsonCompatible } from "../json/jsonast.d.ts"
 */


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

      // Remove when caching is implemented
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/external" })
        .reply(200, external, { headers: { "content-type": "application/reference+json" } });

      const hyperjump = new Hyperjump();
      const subject = await hyperjump.get(uri);
      const generator = hyperjump.iter(/** @type NonNullable<any> */ (subject));

      const first = /** @type JsonCompatible<JrefNode> */ ((await generator.next()).value);
      expect(toJref(first, uri)).to.equal(`1`);
      const second = /** @type JsonCompatible<JrefNode> */ ((await generator.next()).value);
      expect(toJref(second, uri)).to.equal(`2`);
      const third = /** @type JsonCompatible<JrefNode> */ ((await generator.next()).value);
      expect(toJref(third, uri)).to.equal(`2`);
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
      const generator = hyperjump.keys(/** @type NonNullable<any> */ (subject));

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

      // Remove when caching is implemented
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/external" })
        .reply(200, external, { headers: { "content-type": "application/reference+json" } });

      const hyperjump = new Hyperjump();
      const subject = await hyperjump.get(uri);
      const generator = hyperjump.values(/** @type NonNullable<any> */ (subject));

      const first = /** @type JsonCompatible<JrefNode> */ ((await generator.next()).value);
      expect(toJref(first, uri)).to.equal(`1`);
      const second = /** @type JsonCompatible<JrefNode> */ ((await generator.next()).value);
      expect(toJref(second, uri)).to.equal(`2`);
      const third = /** @type JsonCompatible<JrefNode> */ ((await generator.next()).value);
      expect(toJref(third, uri)).to.equal(`2`);
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

      // Remove when caching is implemented
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/external" })
        .reply(200, external, { headers: { "content-type": "application/reference+json" } });

      const hyperjump = new Hyperjump();
      const subject = await hyperjump.get(uri);
      const generator = hyperjump.entries(/** @type NonNullable<any> */ (subject));

      const a = /** @type [string, JsonCompatible<JrefNode>] */ ((await generator.next()).value);
      expect(a[0]).to.eql("a");
      expect(toJref(a[1], uri)).to.equal(`1`);

      const b = /** @type [string, JsonCompatible<JrefNode>] */ ((await generator.next()).value);
      expect(b[0]).to.eql("b");
      expect(toJref(b[1], uri)).to.equal(`2`);

      const c = /** @type [string, JsonCompatible<JrefNode>] */ ((await generator.next()).value);
      expect(c[0]).to.eql("c");
      expect(toJref(c[1], uri)).to.equal(`2`);

      expect((await generator.next()).done).to.equal(true);
    });
  });
});
