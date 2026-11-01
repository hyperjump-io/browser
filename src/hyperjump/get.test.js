import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump, jrefStep, ReferenceCycleError, Session } from "./index.js";
import { toJson } from "../json/jsonast-util.js";
import { fromJref } from "../jref/jref-util.js";

/**
 * @import { GetOptions } from "./index.js"
 * @import { JrefNode } from "../jref/jref-ast.js"
 */

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

      const browser = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = browser.session();
      const subject = await session.get(uri);

      expect(toJson(subject, { space: "  " })).to.eql(jref);
    });

    test("getDocument", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "$ref": "/bar" }`, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = browser.session();
      const subject = await session.getDocument(`${testDomain}/foo#/ignored`);

      expect(subject.type).to.equal("jref-document");
      expect(subject.uri).to.equal(`${testDomain}/foo`);
      expect(toJson(subject.children[0])).to.equal(`{"$ref":"/bar"}`);
    });

    test("getDocument uses the same cache as get", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "foo": 42 }`, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = browser.session();
      const node = await session.get(`${testDomain}/foo#/foo`);
      const subject = await session.getDocument(`${testDomain}/foo`);

      expect(subject.children[0].jsonType === "object" && subject.children[0].children[0].children[1]).to.equal(node);
    });

    test("references are followed through an overridden getDocument", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "$ref": "/bar#/bar" }`, { headers: { "content-type": "application/reference+json" } });

      /** @type {{ uri: string; referencedFrom?: string }[]} */
      const lookups = [];

      class TestSession extends Session {
        /**
         * @param {string} uri
         * @param {GetOptions} [options]
         */
        async getDocument(uri, options) {
          lookups.push({ uri, referencedFrom: options?.referencedFrom });
          if (uri === `${testDomain}/bar#/bar`) {
            const node = /** @type JrefNode */ (fromJref(`{ "bar": 42 }`, `${testDomain}/bar`).node);
            return { type: "jref-document", children: [node], uri: `${testDomain}/bar`, mediaType: "application/reference+json" };
          }
          return super.getDocument(uri, options);
        }
      }

      const session = new TestSession(new Hyperjump({ allowRetrieval: ["https://example.com/"] }));
      const subject = await session.get(`${testDomain}/foo`);

      expect(toJson(subject)).to.equal(`42`);
      expect(lookups).to.eql([
        { uri: `${testDomain}/foo`, referencedFrom: undefined },
        { uri: `${testDomain}/bar#/bar`, referencedFrom: `${testDomain}/foo` }
      ]);
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

      const browser = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = browser.session();
      const subject = await session.get(`${uri}#/bar`);

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

      const browser = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = browser.session();
      const subject = await session.get(uri);

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

      const browser = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = browser.session();
      const subject = await session.get(uri);

      expect(toJson(subject)).to.eql(`24`);
    });

    test("a fragment is a percent-encoded JSON Pointer", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "a^b": { "c d": 42 } }`, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = browser.session();
      const subject = await session.get(`${testDomain}/foo#/a%5Eb/c%20d`);

      expect(toJson(subject)).to.equal(`42`);
      expect(subject.location).to.equal(`${testDomain}/foo#/a%5Eb/c%20d`);
    });

    test("an unnecessarily encoded fragment finds the same node", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "$defs": 42 }`, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = browser.session();
      const subject = await session.get(`${testDomain}/foo#/%24defs`);

      expect(toJson(subject)).to.equal(`42`);
      expect(subject.location).to.equal(`${testDomain}/foo#/$defs`);
    });

    test("reference to itself", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "$ref": "#" }`, { headers: { "content-type": "application/reference+json" } });

      const browser = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = browser.session();
      const error = await session.get(`${testDomain}/foo`).catch((/** @type unknown */ error) => error);
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

      const browser = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = browser.session();
      const error = await session.get(`${testDomain}/foo`).catch((/** @type unknown */ error) => error);
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

      const browser = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
      const session = browser.session();
      const root = await session.get(`${testDomain}/foo`);
      const self = await jrefStep(session, "self", root);
      const selfSelf = await jrefStep(session, "self", self);
      const subject = await jrefStep(session, "foo", selfSelf);

      expect(toJson(subject)).to.equal(`42`);
    });
  });
});
