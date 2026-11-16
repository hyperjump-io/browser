import { describe, test, expect } from "vitest";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { get } from "./documents.js";
import { jrefSelect, jrefSelectAll } from "./select.js";
import { jrefArrayIter, jrefObjectEntries, jrefObjectHas, jrefObjectKeys, jrefObjectValues, jrefStep, jrefValue } from "./step.js";
import { jrefFind, jrefFindAll, jrefVisit } from "./visit.js";
import { Hyperjump } from "../hyperjump.js";
import { fetcher } from "../layers.js";
import { jrefParse } from "../jref/jref-parse.js";
import { fromJref } from "../jref/jref-util.js";
import { toJson } from "../json/jsonast-util.js";
import { coded } from "../test-helpers/errors.js";
import { jrefMediaType } from "../media-types/jref-media-type.js";
import { defaultMediaTypes } from "../media-types/media-types.js";
import { Trace } from "../trace.js";

/**
 * @import { HyperjumpConfig } from "../hyperjump.d.ts"
 * @import { Json } from "../json/jsonast.d.ts"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "../media-types/media-types.d.ts"
 */

describe("stepping", () => {
  describe("jrefStep", () => {
    test("is a property or an item", async () => {
      const { session } = site({ "/a": { foo: [1, 42] } });
      const foo = await jrefStep(session, "foo", await get(session, "https://a.test/a"));
      expect(toJson((await jrefStep(session, "1", foo)).node)).to.equal(`42`);
    });

    test("follows a reference in the same document, and in another", async () => {
      const { session, requests } = site({
        "/a": { foo: 42, local: { $ref: "#/foo" }, other: { $ref: "/b#/bar" } },
        "/b": { bar: { $ref: "#/baz" }, baz: "here" }
      });
      const subject = await get(session, "https://a.test/a");
      expect(toJson((await jrefStep(session, "local", subject)).node)).to.equal(`42`);
      const other = await jrefStep(session, "other", subject);
      expect(toJson(other.node)).to.equal(`"here"`);
      expect(other.node.location).to.equal("https://a.test/b#/baz");
      expect(requests).to.eql(["/a", "/b"]);
    });

    test("a member's target has the document it's in", async () => {
      const { session } = site({ "/a": { foo: 42, other: { $ref: "/b" } }, "/b": 1 });
      const subject = await get(session, "https://a.test/a");
      const foo = await jrefStep(session, "foo", subject);
      expect(foo.document, "a member is in the same document").to.equal(subject.document);
      const other = await jrefStep(session, "other", subject);
      expect(other.document, "what a reference leads to is in its own").to.equal((await get(session, "https://a.test/b")).document);
    });

    test("with reference: \"manual\", a reference isn't followed", async () => {
      const { session, requests } = site({ "/a": { other: { $ref: "/b" } }, "/b": 1 });
      const subject = await get(session, "https://a.test/a");
      const other = await jrefStep(session, "other", subject, { reference: "manual" });
      expect(other.node).to.include({ type: "reference", href: "https://a.test/b" });
      expect(other.document).to.equal(subject.document);
      expect(requests).to.eql(["/a"]);
      const href = other.node.type === "reference" ? other.node.href : "";
      expect(toJson((await get(session, href, { referencedFrom: other })).node), "and it can be followed from").to.equal(`1`);
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

    test("a reference in a document the session didn't retrieve is still followed", async () => {
      const { session } = site({ "/b": 1 });
      const document = await jrefMediaType.parse({ text: async () => `{ "b": { "$ref": "/b" } }`, url: "https://a.test/mine" });
      expect(toJson((await jrefStep(session, "b", document)).node)).to.equal(`1`);
    });

    test("a tree from a unified pipeline is browsed as it is, and a node a unist utility finds in it is followed from it", async () => {
      const { session } = site({ "/b": { c: 1 }, "/c": 2 });
      const tree = unified()
        .use(jrefParse, { url: "https://a.test/mine" })
        .parse(`{ "b": { "$ref": "/b" }, "c": { "$ref": "/c" } }`);
      const c = await jrefSelect(session, "> [key=b] > [key=c]", tree);
      expect(c && toJson(c.node)).to.equal(`1`);

      /** @type string[] */
      const hrefs = [];
      visit(tree, "reference", (node) => {
        hrefs.push(/** @type {{ href: string }} */ (/** @type unknown */ (node)).href);
      });
      expect(hrefs).to.eql(["https://a.test/b", "https://a.test/c"]);
      expect(toJson((await get(session, hrefs[1], { referencedFrom: tree })).node)).to.equal(`2`);
    });

    test("a tree whose parse failed is browsed for what it has", async () => {
      const { session } = site({ "/b": 1 });
      const tree = unified()
        .use(jrefParse, { url: "https://a.test/mine", accept: "failure" })
        .parse(`{ "a": , "b": { "$ref": "/b" }, "c": @ }`);

      /** @type string[] */
      const visited = [];
      await jrefVisit(session, tree, (target, key) => {
        visited.push(`${key} ${target.node.type}`);
      });
      expect(visited, "a missing value isn't a member").to.eql(["undefined json", "b json", "c json-invalid"]);
      expect(toJson((await jrefStep(session, "b", tree)).node)).to.equal(`1`);
    });

    test("a tree with nothing in it has no value, so a walk of it visits nothing", async () => {
      const { session } = site({});
      const tree = unified()
        .use(jrefParse, { url: "https://a.test/mine", accept: "failure" })
        .parse(``);
      expect(tree.children.map(({ type }) => type)).to.eql(["json-missing"]);

      /** @type unknown[] */
      const visited = [];
      await jrefVisit(session, tree, (target) => {
        visited.push(target);
      });
      expect(visited).to.eql([]);
      expect(await jrefFind(session, tree, null)).to.equal(undefined);
      expect(await jrefFindAll(session, tree, null)).to.eql([]);
      expect(await jrefSelect(session, ":root", tree)).to.equal(undefined);
      expect(await jrefSelectAll(session, "*", tree)).to.eql([]);
      await expect(get(session, "https://a.test/mine", { referencedFrom: tree })).rejects.toThrow(coded("ERR_POINTER_NOT_FOUND", "https://a.test/mine#"));
    });

    test("a value that's missing from a parse that failed isn't there to step to or to get", async () => {
      const { session } = site({});
      const tree = unified()
        .use(jrefParse, { url: "https://a.test/mine", accept: "failure" })
        .parse(`{ "a": }`);
      await expect(jrefStep(session, "a", tree)).rejects.toThrow(coded("ERR_POINTER_NOT_FOUND", "https://a.test/mine#/a"));
      await expect(jrefStep(session, "a", tree)).rejects.toThrow("There's no value at https://a.test/mine#/a");
      await expect(get(session, "https://a.test/mine#/a", { referencedFrom: tree })).rejects.toThrow(coded("ERR_POINTER_NOT_FOUND", "https://a.test/mine#/a"));
    });
  });

  describe("embedded documents", () => {
    test("a reference in a node of an embedded document finds what its container has", async () => {
      const { session, requests } = site({
        "/bundle": { main: { x: { $ref: "/x" } }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "the bundle's" } },
        "/y": "the real one"
      });
      const bundle = await get(session, "https://a.test/bundle");
      const x = await jrefStep(session, "x", bundle);
      expect(x.node.location).to.equal("https://a.test/x#");
      expect(x.document, "its document is the container").to.equal(bundle.document);
      expect(toJson((await jrefStep(session, "y", x)).node)).to.equal(`"the bundle's"`);
      expect(requests).to.eql(["/bundle"]);
    });

    test("when two documents contain a document with the same URL, each one's nodes find their own", async () => {
      const { session, requests } = site({
        "/one": { main: { $ref: "/x" }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "one's" } },
        "/two": { main: { $ref: "/x" }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "two's" } }
      });
      const one = await get(session, "https://a.test/one");
      const two = await get(session, "https://a.test/two");
      expect(toJson((await jrefStep(session, "y", two)).node)).to.equal(`"two's"`);
      expect(toJson((await jrefStep(session, "y", one)).node)).to.equal(`"one's"`);
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
        items.push(toJson(item.node));
      }
      expect(items).to.eql(["1", "2", "1"]);
    });

    test("jrefObjectValues and jrefObjectEntries follow the values that are references", async () => {
      const { session } = site({ "/a": { a: 1, b: { $ref: "/b" } }, "/b": 2 });
      const subject = await get(session, "https://a.test/a");
      const values = [];
      for await (const value of jrefObjectValues(session, subject)) {
        values.push(toJson(value.node));
      }
      expect(values).to.eql(["1", "2"]);

      const entries = [];
      for await (const [key, value] of jrefObjectEntries(session, subject)) {
        entries.push([key, toJson(value.node)]);
      }
      expect(entries).to.eql([["a", "1"], ["b", "2"]]);
    });

    test("a member is followed when the iterator reaches it, so stopping early retrieves less", async () => {
      const { session, requests } = site({ "/a": [{ $ref: "/b" }, { $ref: "/c" }], "/b": 1, "/c": 2 });
      for await (const item of jrefArrayIter(session, await get(session, "https://a.test/a"))) {
        expect(toJson(item.node)).to.equal(`1`);
        break;
      }
      expect(requests).to.eql(["/a", "/b"]);
    });

    test("with reference: \"manual\", members are as they're written, in the same document", async () => {
      const { session, requests } = site({ "/a": { a: 1, b: { $ref: "/b" } }, "/b": [{ $ref: "/a" }] });
      const subject = await get(session, "https://a.test/a");
      const entries = [];
      for await (const [key, value] of jrefObjectEntries(session, subject, { reference: "manual" })) {
        expect(value.document).to.equal(subject.document);
        entries.push([key, value.node.type]);
      }
      expect(entries).to.eql([["a", "json"], ["b", "reference"]]);

      const values = [];
      for await (const value of jrefObjectValues(session, subject, { reference: "manual" })) {
        values.push(value.node.type);
      }
      expect(values).to.eql(["json", "reference"]);
      expect(requests).to.eql(["/a"]);

      const items = [];
      for await (const item of jrefArrayIter(session, await get(session, "https://a.test/b"), { reference: "manual" })) {
        items.push(item.node.type);
      }
      expect(items).to.eql(["reference"]);
      expect(requests).to.eql(["/a", "/b"]);
    });

    test("an iterator of the wrong kind of node has nothing", async () => {
      const { session } = site({ "/a": { a: [1] } });
      const subject = await get(session, "https://a.test/a");
      expect(await jrefArrayIter(session, subject).next()).to.eql({ value: undefined, done: true });
      const a = await jrefStep(session, "a", subject);
      expect(await jrefObjectValues(session, a).next()).to.eql({ value: undefined, done: true });
      expect(await jrefObjectEntries(session, a).next()).to.eql({ value: undefined, done: true });
    });

    test("once it's done, it stays done, and return() ends it", async () => {
      const { session, requests } = site({ "/a": [1, { $ref: "/b" }], "/b": 2 });
      const subject = await get(session, "https://a.test/a");
      const items = jrefArrayIter(session, subject);
      const first = await items.next();
      expect(first.done === true ? undefined : toJson(first.value.node)).to.equal(`1`);
      expect(await items.return?.()).to.eql({ value: undefined, done: true });
      expect(await items.next()).to.eql({ value: undefined, done: true });
      expect(requests, "what it didn't reach isn't retrieved").to.eql(["/a"]);

      const all = jrefArrayIter(session, subject);
      await all.next();
      await all.next();
      expect(await all.next()).to.eql({ value: undefined, done: true });
      expect(await all.next()).to.eql({ value: undefined, done: true });
    });

    test("calls to next() that overlap get the members in order", async () => {
      const { session } = site({ "/a": [{ $ref: "/b" }, 1, { $ref: "/c" }], "/b": "b", "/c": "c" });
      const items = jrefArrayIter(session, await get(session, "https://a.test/a"));
      const results = await Promise.all([items.next(), items.next(), items.next(), items.next()]);
      expect(results.map(({ value, done }) => done ? "done" : toJson(value.node))).to.eql([`"b"`, `1`, `"c"`, "done"]);
    });

    test("a reference that can't be followed rejects, and the iterator is done", async () => {
      const { session } = site({ "/a": [{ $ref: "/missing" }, 1] });
      const items = jrefArrayIter(session, await get(session, "https://a.test/a"));
      await expect(items.next()).rejects.toThrow(coded("ERR_HTTP_STATUS", "https://a.test/missing"));
      expect(await items.next()).to.eql({ value: undefined, done: true });
    });

    test("it's an async iterator, with what an engine gives one", async () => {
      const { session } = site({ "/a": [1, 2] });
      const items = jrefArrayIter(session, await get(session, "https://a.test/a"));
      expect(items[Symbol.asyncIterator]()).to.equal(items);
      await items[Symbol.asyncDispose]();
      expect(await items.next()).to.eql({ value: undefined, done: true });
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
      const b = await jrefStep(session, "b", subject);
      expect(() => jrefValue(b)).toThrow(coded("ERR_STRUCTURED_VALUE", "https://a.test/a#/b"));
    });
  });

  describe("walking the tree as it's written", () => {
    test("jrefVisit with reference: \"manual\" visits references without following them", async () => {
      const { session, requests } = site({ "/a": { a: 1, b: { $ref: "/b" } }, "/b": 2 });
      const subject = await get(session, "https://a.test/a");
      /** @type string[] */
      const visited = [];
      await jrefVisit(session, subject, (target, key) => {
        expect(target.document).to.equal(subject.document);
        visited.push(`${key} ${target.node.type}`);
      }, { reference: "manual" });
      expect(visited.slice(0, 3)).to.eql(["undefined json", "a json", "b reference"]);
      expect(requests).to.eql(["/a"]);
    });

    test("a walk that starts at a reference doesn't follow it", async () => {
      const { session, requests } = site({ "/a": { $ref: "/b" }, "/b": 2 });
      const start = await get(session, "https://a.test/a", { reference: "manual" });
      /** @type unknown[] */
      const visited = [];
      await jrefVisit(session, start, (target, key) => {
        if (key === undefined) {
          visited.push(target.node);
        }
      }, { reference: "manual" });
      expect(visited).to.eql([start.node]);
      expect(requests).to.eql(["/a"]);
    });

    test("jrefFind and jrefFindAll find references by type", async () => {
      const { session, requests } = site({ "/a": { a: { $ref: "/b" }, b: [{ $ref: "/c" }] } });
      const subject = await get(session, "https://a.test/a");
      const first = await jrefFind(session, subject, "reference", { reference: "manual" });
      expect(first?.node).to.include({ href: "https://a.test/b" });
      const all = await jrefFindAll(session, subject, "reference", { reference: "manual" });
      expect(all.map(({ node }) => node.href)).to.eql(["https://a.test/b", "https://a.test/c"]);
      expect(all.every(({ document }) => document === subject.document)).to.equal(true);
      expect(requests).to.eql(["/a"]);
    });

    test("jrefSelect and jrefSelectAll select references", async () => {
      const { session, requests } = site({ "/a": { a: { $ref: "/b" }, b: [{ $ref: "/c" }] } });
      const subject = await get(session, "https://a.test/a");
      const a = await jrefSelect(session, "> [key=a]", subject, { reference: "manual" });
      expect(a?.node).to.include({ type: "reference", href: "https://a.test/b" });
      const all = await jrefSelectAll(session, "[type=reference]", subject, { reference: "manual" });
      expect(all.map(({ node }) => node.location)).to.eql(["https://a.test/a#/a", "https://a.test/a#/b/0"]);
      expect(requests).to.eql(["/a"]);
    });

    test("without it, a reference is never found, because it's followed", async () => {
      const { session } = site({ "/a": { a: { $ref: "/b" } }, "/b": 2 });
      const subject = await get(session, "https://a.test/a");
      expect(await jrefFindAll(session, subject, "reference")).to.eql([]);
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
    const document = (value, url) => ({ type: "bundle-document", children: [jrefNode(value, url)], url, anchors: {} });
    return {
      ...document(main, response.url),
      embedded: Object.fromEntries(Object.entries(embedded).map(([url, value]) => [url, document(value, url)]))
    };
  }
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
