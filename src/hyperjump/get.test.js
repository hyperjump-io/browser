import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump, ReferenceCycleError } from "./index.js";
import { toJson } from "../json/jsonast-util.js";

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

      expect(toJson(subject, undefined, "  ")).to.eql(jref);
    });

    test("getDocument", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "$ref": "/bar" }`, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump();
      const subject = await browser.getDocument(`${testDomain}/foo#/ignored`);

      expect(subject.type).to.equal("jref-document");
      expect(subject.uri).to.equal(`${testDomain}/foo`);
      expect(toJson(subject.children[0])).to.equal(`{"$ref":"/bar"}`);
    });

    test("getDocument uses the same cache as get", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump();
      const node = await browser.get(`${testDomain}/foo#/foo`);
      const subject = await browser.getDocument(`${testDomain}/foo`);

      expect(subject.children[0].jsonType === "object" && subject.children[0].children[0].children[1]).to.equal(node);
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

      expect(toJson(subject)).to.eql(`42`);
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

      expect(toJson(subject)).to.eql(`"bar"`);
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

      expect(toJson(subject)).to.eql(`24`);
    });

    test("reference to itself", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "$ref": "#" }`, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump();
      const error = await browser.get(`${testDomain}/foo`).catch((/** @type unknown */ error) => error);
      expect(error).to.be.instanceof(ReferenceCycleError);
      expect(/** @type ReferenceCycleError */ (error).referenceChain).to.eql([
        `${testDomain}/foo`,
        `${testDomain}/foo#`,
        `${testDomain}/foo#`
      ]);
    });

    test("reference cycle across documents", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "$ref": "/bar" }`, { headers: { "content-type": "application/reference+json" } });
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/bar" })
        .reply(200, `{ "$ref": "/foo" }`, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump();
      const error = await browser.get(`${testDomain}/foo`).catch((/** @type unknown */ error) => error);
      expect(error).to.be.instanceof(ReferenceCycleError);
      expect(/** @type ReferenceCycleError */ (error).referenceChain).to.eql([
        `${testDomain}/foo`,
        `${testDomain}/bar`,
        `${testDomain}/foo`
      ]);
    });

    test("structural cycles are not reference cycles", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42, "self": { "$ref": "#" } }`, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump();
      const root = await browser.get(`${testDomain}/foo`);
      const self = await browser.step("self", root);
      const selfSelf = await browser.step("self", self);
      const subject = await browser.step("foo", selfSelf);

      expect(toJson(subject)).to.equal(`42`);
    });
  });
});
