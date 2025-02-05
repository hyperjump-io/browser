import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump } from "./index.js";
import { toJref } from "../jref/jref-util.js";


describe("JSON Browser", () => {
  describe("get", () => {
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

    test("simple get", async () => {
      const path = "/foo";
      const uri = `${testDomain}${path}`;
      const jref = `{
  "foo": 42,
  "bar": {
    "$ref": "#/foo"
  }
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump();
      const subject = await browser.get(uri);

      expect(toJref(/** @type NonNullable<any> */ (subject), uri)).to.eql(jref);
    });

    test("follow fragment-only reference", async () => {
      const path = "/foo";
      const uri = `${testDomain}${path}`;
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
      const subject = await browser.get(`${uri}#/bar`);

      expect(toJref(/** @type NonNullable<any> */ (subject), uri)).to.eql(`42`);
    });

    test("follow reference to another document", async () => {
      const path = "/foo#/bar";
      const uri = `${testDomain}${path}`;
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

      const browser = new Hyperjump();
      const subject = await browser.get(uri);

      expect(toJref(/** @type NonNullable<any> */ (subject), uri)).to.eql(`"bar"`);
    });

    test("follow a reference to another document with a fragment", async () => {
      const path = "/foo#/bar";
      const uri = `${testDomain}${path}`;
      const href = "/bar#/baz";
      const foo = `{
  "foo": 42,
  "bar": { "$ref": "${href}" }
}`;
      const bar = `{
  "baz": 24
}`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: path })
        .reply(200, foo, { headers: { "content-type": "application/reference+json" } });

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: href })
        .reply(200, bar, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump();
      const subject = await browser.get(uri);

      expect(toJref(/** @type NonNullable<any> */ (subject), uri)).to.eql(`24`);
    });
  });
});
