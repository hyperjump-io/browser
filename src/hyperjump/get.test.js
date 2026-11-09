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
      const url = `${testDomain}${path}`;
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
      const subject = await session.get(url);

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
      expect(subject.url).to.equal(`${testDomain}/foo`);
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

    test("a string that isn't a URL throws", async () => {
      const session = new Hyperjump().session();
      await expect(session.get("https://[")).rejects.toBeInstanceOf(TypeError);
    });

    test("getDocument parses its URL too", async () => {
      const session = new Hyperjump().session();
      await expect(session.getDocument("https://[")).rejects.toBeInstanceOf(TypeError);
    });

    test.each([
      ["isn't a URL", "https://["],
      ["is relative", "doc.jref"]
    ])("a referencedFrom that %s throws", async (_description, referencedFrom) => {
      const session = new Hyperjump().session();

      await expect(session.get(`${testDomain}/foo`, { referencedFrom })).rejects.toBeInstanceOf(TypeError);
      await expect(session.getDocument(`${testDomain}/foo`, { referencedFrom })).rejects.toBeInstanceOf(TypeError);
    });

    test("equivalent URLs are one document", async () => {
      let retrievals = 0;
      const hyperjump = new Hyperjump({
        allowRetrieval: ["https://example.com/"],
        urlSchemePlugins: [{
          schemes: ["https"],
          retrieve: async () => {
            retrievals++;
            return new Response(`{ "foo": 42 }`, { headers: { "Content-Type": "application/reference+json" } });
          }
        }]
      });
      const session = hyperjump.session();

      const document = await session.getDocument("https://example.com/a");
      expect(await session.getDocument("HTTPS://Example.com:443/a")).to.equal(document);
      expect(await session.getDocument("https://example.com/b/../a#/foo")).to.equal(document);
      expect(retrievals).to.equal(1);
    });

    test("references are followed through an overridden getDocument", async () => {
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/foo" })
        .reply(200, `{ "$ref": "/bar#/bar" }`, { headers: { "content-type": "application/reference+json" } });

      /** @type {{ url: string; referencedFrom?: string }[]} */
      const lookups = [];

      class TestSession extends Session {
        /**
         * @param {string} url
         * @param {GetOptions} [options]
         */
        async getDocument(url, options) {
          lookups.push({ url, referencedFrom: options?.referencedFrom });
          if (url === `${testDomain}/bar#/bar`) {
            const node = /** @type JrefNode */ (fromJref(`{ "bar": 42 }`, `${testDomain}/bar`).node);
            return { type: "jref-document", children: [node], url: `${testDomain}/bar`, mediaType: "application/reference+json" };
          }
          return super.getDocument(url, options);
        }
      }

      const session = new TestSession(new Hyperjump({ allowRetrieval: ["https://example.com/"] }));
      const subject = await session.get(`${testDomain}/foo`);

      expect(toJson(subject)).to.equal(`42`);
      expect(lookups).to.eql([
        { url: `${testDomain}/foo`, referencedFrom: undefined },
        { url: `${testDomain}/bar#/bar`, referencedFrom: `${testDomain}/foo` }
      ]);
    });

    test("a reference is given to an overridden getDocument parsed", async () => {
      /** @type {{ url: string; referencedFrom?: string }[]} */
      const lookups = [];

      class TestSession extends Session {
        /**
         * @param {string} url
         * @param {GetOptions} [options]
         */
        async getDocument(url, options) {
          lookups.push({ url, referencedFrom: options?.referencedFrom });
          if (url === "urn:test:foo") {
            const node = /** @type JrefNode */ (fromJref(`{ "$ref": "#" }`, "URN:test:foo").node);
            // A media type plugin can give a reference an href that isn't
            // parsed
            Object.assign(node, { href: "HTTPS://Example.com/bar#/bar" });
            return { type: "jref-document", children: [node], url: "urn:test:foo", mediaType: "application/reference+json" };
          } else if (url === "https://example.com/bar#/bar") {
            const node = /** @type JrefNode */ (fromJref(`{ "bar": 42 }`, "https://example.com/bar").node);
            return { type: "jref-document", children: [node], url: "https://example.com/bar", mediaType: "application/reference+json" };
          }
          return super.getDocument(url, options);
        }
      }

      const session = new TestSession(new Hyperjump({ allowRetrieval: [] }));
      const subject = await session.get("URN:test:foo");

      expect(toJson(subject)).to.equal(`42`);
      expect(lookups).to.eql([
        { url: "urn:test:foo", referencedFrom: undefined },
        { url: "https://example.com/bar#/bar", referencedFrom: "urn:test:foo" }
      ]);
    });

    test("follow fragment-only reference", async () => {
      const path = "/foo";
      const url = `${testDomain}${path}`;
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
      const subject = await session.get(`${url}#/bar`);

      expect(toJson(subject)).to.eql(`42`);
    });

    test("follow reference to another document", async () => {
      const path = "/foo#/bar";
      const url = `${testDomain}${path}`;
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
      const subject = await session.get(url);

      expect(toJson(subject)).to.eql(`"bar"`);
    });

    test("follow a reference to another document with a fragment", async () => {
      const path = "/foo#/bar";
      const url = `${testDomain}${path}`;
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
      const subject = await session.get(url);

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
      expect(subject.location).to.equal(`${testDomain}/foo#/a^b/c%20d`);
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
