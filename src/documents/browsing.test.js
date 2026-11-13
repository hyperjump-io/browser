import { describe, test, expect } from "vitest";
import { jrefArrayIter, jrefObjectEntries, jrefObjectHas, jrefObjectKeys, jrefObjectValues, jrefStep, jrefValue } from "./browsing.js";
import { get } from "./documents.js";
import { Hyperjump } from "../hyperjump.js";
import { fetcher } from "../layers.js";
import { fromJref } from "../jref/jref-util.js";
import { jsonStep, toJson } from "../json/jsonast-util.js";
import { coded } from "../test-helpers/errors.js";
import { defaultMediaTypes } from "../media-types/media-types.js";
import { Trace } from "../trace.js";

/**
 * @import { FollowedNode } from "./documents.d.ts"
 * @import { HyperjumpConfig } from "../hyperjump.d.ts"
 * @import { Json } from "../json/jsonast.d.ts"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "../media-types/media-types.d.ts"
 */

describe("browsing", () => {
  describe("jrefStep", () => {
    test("is a property or an item", async () => {
      const { session } = site({ "/a": { foo: [1, 42] } });
      const foo = await jrefStep(session, "foo", await get(session, "https://a.test/a"));
      expect(toJson(await jrefStep(session, "1", foo))).to.equal(`42`);
    });

    test("follows a reference in the same document, and in another", async () => {
      const { session, requests } = site({
        "/a": { foo: 42, local: { $ref: "#/foo" }, other: { $ref: "/b#/bar" } },
        "/b": { bar: { $ref: "#/baz" }, baz: "here" }
      });
      const subject = await get(session, "https://a.test/a");
      expect(toJson(await jrefStep(session, "local", subject))).to.equal(`42`);
      const other = await jrefStep(session, "other", subject);
      expect(toJson(other)).to.equal(`"here"`);
      expect(other.location).to.equal("https://a.test/b#/baz");
      expect(requests).to.eql(["/a", "/b"]);
    });

    test("a property or item that doesn't exist is an error with a code and its location", async () => {
      const { session } = site({ "/a": { foo: [] } });
      const subject = await get(session, "https://a.test/a");
      await expect(jrefStep(session, "bar", subject)).rejects.toThrow(coded("ERR_POINTER_NOT_FOUND", "https://a.test/a#/bar"));
      await expect(jrefStep(session, "0", await jrefStep(session, "foo", subject))).rejects.toThrow(coded("ERR_POINTER_NOT_FOUND", "https://a.test/a#/foo/0"));
    });

    test("a reference that's followed is caused by the document it's in", async () => {
      const { session } = site({ "/a": { b: { $ref: "/b" } }, "/b": { c: { $ref: "/c" } }, "/c": 1 });
      const trace = new Trace(session);
      const b = await jrefStep(session, "b", await get(session, "https://a.test/a"));
      await jrefStep(session, "c", b);
      expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /a", "1 /b", "2 /c"]);
    });

    test("a reference in a node the session doesn't have is still followed", async () => {
      const { session } = site({ "/b": 1 });
      const { node } = fromJref(`{ "b": { "$ref": "/b" } }`, "https://a.test/mine");
      expect(toJson(await jrefStep(session, "b", /** @type FollowedNode */ (node)))).to.equal(`1`);
    });
  });

  describe("embedded documents", () => {
    test("a reference in a node of an embedded document finds what its container has", async () => {
      const { session, requests } = site({
        "/bundle": { main: { x: { $ref: "/x" } }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "the bundle's" } },
        "/y": "the real one"
      });
      const x = await jrefStep(session, "x", await get(session, "https://a.test/bundle"));
      expect(x.location).to.equal("https://a.test/x#");
      expect(toJson(await jrefStep(session, "y", x))).to.equal(`"the bundle's"`);
      expect(requests).to.eql(["/bundle"]);
    });

    test("when two documents contain a document with the same URL, each one's nodes find their own", async () => {
      const { session, requests } = site({
        "/one": { main: { $ref: "/x" }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "one's" } },
        "/two": { main: { $ref: "/x" }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "two's" } }
      });
      const one = await get(session, "https://a.test/one");
      const two = await get(session, "https://a.test/two");
      expect(toJson(await jrefStep(session, "y", two))).to.equal(`"two's"`);
      expect(toJson(await jrefStep(session, "y", one))).to.equal(`"one's"`);
      expect(requests).to.eql(["/one", "/two"]);
    });

    test("what an embedded document's node refers to that isn't contained is caused by its container", async () => {
      const { session } = site({
        "/bundle": { main: { $ref: "/x" }, embedded: { "https://a.test/x": { other: { $ref: "/other" } } } },
        "/other": 1
      });
      const trace = new Trace(session);
      await jrefStep(session, "other", await get(session, "https://a.test/bundle"));
      expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /bundle", "1 /other"]);
    });
  });

  describe("iterating", () => {
    test("jrefArrayIter follows the items that are references", async () => {
      const { session } = site({ "/a": [1, { $ref: "/b" }, { $ref: "#/0" }], "/b": 2 });
      const items = [];
      for await (const item of jrefArrayIter(session, await get(session, "https://a.test/a"))) {
        items.push(toJson(item));
      }
      expect(items).to.eql(["1", "2", "1"]);
    });

    test("jrefObjectValues and jrefObjectEntries follow the values that are references", async () => {
      const { session } = site({ "/a": { a: 1, b: { $ref: "/b" } }, "/b": 2 });
      const subject = await get(session, "https://a.test/a");
      const values = [];
      for await (const value of jrefObjectValues(session, subject)) {
        values.push(toJson(value));
      }
      expect(values).to.eql(["1", "2"]);

      const entries = [];
      for await (const [key, value] of jrefObjectEntries(session, subject)) {
        entries.push([key, toJson(value)]);
      }
      expect(entries).to.eql([["a", "1"], ["b", "2"]]);
    });

    test("jrefObjectKeys and jrefObjectHas read property names, which need no following", async () => {
      const { session, requests } = site({ "/a": { a: 1, b: { $ref: "/b" } } });
      const subject = await get(session, "https://a.test/a");
      expect([...jrefObjectKeys(subject)]).to.eql(["a", "b"]);
      expect(jrefObjectHas("b", subject)).to.equal(true);
      expect(jrefObjectHas("c", subject)).to.equal(false);
      expect(requests).to.eql(["/a"]);
    });
  });

  describe("jrefValue", () => {
    test("is the value of a string, number, boolean, or null", async () => {
      const { session } = site({ "/a": ["a", 1, true, null] });
      const values = [];
      for await (const item of jrefArrayIter(session, await get(session, "https://a.test/a"))) {
        values.push(jrefValue(item));
      }
      expect(values).to.eql(["a", 1, true, null]);
    });

    test("throws for an object or an array, which could have references", async () => {
      const { session } = site({ "/a": { b: [] } });
      const subject = await get(session, "https://a.test/a");
      expect(() => jrefValue(subject)).to.throw("Can't get the value of an object at https://a.test/a#. Step into it instead.");
      expect(() => jrefValue(subject)).toThrow(coded("ERR_STRUCTURED_VALUE", "https://a.test/a#"));
      expect(() => jrefValue(/** @type FollowedNode */ (jsonStep("b", subject)))).toThrow(coded("ERR_STRUCTURED_VALUE", "https://a.test/a#/b"));
    });
  });
});

/** @type (value: Json, url: string) => JrefNode */
const jrefNode = (value, url) => /** @type JrefNode */ (fromJref(JSON.stringify(value), url).node);

/**
 * A made-up format with embedded documents: JSON with a `main` JRef value
 * and the JRef values it contains by URL
 *
 * @type MediaTypePlugin<DocumentNode<JrefNode>>
 */
const bundleMediaType = {
  mediaType: "application/x-bundle",
  extensions: [],
  parse: async (response) => {
    const { main, embedded } = /** @type {{ main: Json, embedded: Record<string, Json> }} */ (JSON.parse(await response.text()));
    /** @type (value: Json, url: string) => DocumentNode<JrefNode> */
    const document = (value, url) => ({ type: "bundle-document", children: [jrefNode(value, url)], url });
    return {
      ...document(main, response.url),
      embedded: Object.fromEntries(Object.entries(embedded).map(([url, value]) => [url, document(value, url)]))
    };
  },
  fragmentPointer: (_document, fragment) => decodeURIComponent(fragment)
};

/**
 * A session on a pretend site at `https://a.test`, which answers each path
 * with a JRef document, or a bundle for a path that has "bundle", "one", or
 * "two" in it, and keeps the paths that were requested
 *
 * @type (pages: Record<string, Json>, config?: Omit<HyperjumpConfig, "mediaTypes">) => { session: Hyperjump<{ mediaTypes: (typeof defaultMediaTypes[number] | typeof bundleMediaType)[] }>, requests: string[] }
 */
const site = (pages, config = {}) => {
  /** @type string[] */
  const requests = [];
  const stack = fetcher((request) => {
    const path = new URL(request.url).pathname;
    requests.push(path);
    if (!(path in pages)) {
      return new Response(null, { status: 404 });
    }
    const isBundle = /bundle|one|two/.test(path);
    return new Response(JSON.stringify(pages[path]), { headers: { "content-type": isBundle ? "application/x-bundle" : "application/reference+json" } });
  });
  return {
    session: new Hyperjump({ stack, allowRetrieval: ["https://a.test/"], ...config, mediaTypes: [...defaultMediaTypes, bundleMediaType] }),
    requests
  };
};
