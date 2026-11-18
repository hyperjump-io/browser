import { describe, test, expect } from "vitest";
import { browse } from "./documents.js";
import { jrefStep } from "./step.js";
import { jrefMediaType } from "../media-types/jref-media-type.js";
import { jrefSelect } from "./select.js";
import { jrefFind, jrefVisit } from "./visit.js";
import { Hyperjump } from "../hyperjump.js";
import { fetcher } from "../layers.js";
import { fromJref } from "../jref/jref-util.js";
import { toJson } from "../json/jsonast-util.js";
import { defaultMediaTypes } from "../media-types/media-types.js";
import { Trace } from "../trace.js";

/**
 * @import { DocumentSession, FollowedNode, Start, Target } from "./documents.d.ts"
 * @import { HyperjumpConfig } from "../hyperjump.d.ts"
 * @import { Json } from "../json/jsonast.d.ts"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "../media-types/media-types.d.ts"
 * @import { JrefMediaTypeDocument } from "../media-types/jref-media-type.d.ts"
 */

describe("following references", () => {
  test("a walk follows a reference in the same document, and in another", async () => {
    const { session, requests } = site({
      "/a": { foo: 42, local: { $ref: "#/foo" }, other: { $ref: "/b#/bar" } },
      "/b": { bar: { $ref: "#/baz" }, baz: "here" }
    });
    const subject = await browse(session, "https://a.test/a");
    expect(toJson(await childNode(session, "local", subject))).to.equal(`42`);
    const other = await child(session, "other", subject);
    expect(toJson(other.node)).to.equal(`"here"`);
    expect(other.node.location).to.equal("https://a.test/b#/baz");
    expect(other.document, "its document is the one it's in").to.equal((await browse(session, "https://a.test/b", { reference: "manual" })).document);
    expect((await child(session, "foo", subject)).document, "a member that isn't a reference is in the same document").to.equal(subject.document);
    expect(requests).to.eql(["/a", "/b"]);
  });

  test("a visitor's target has the document its node is in", async () => {
    const { session } = site({
      "/a": { local: 1, other: { $ref: "/b" } },
      "/b": { c: 2 }
    });
    /** @type string[] */
    const visited = [];
    await jrefVisit(session, await browse(session, "https://a.test/a"), ({ document }, key, parent) => {
      visited.push(`${key} in ${new URL(document.url).pathname} under ${parent && new URL(parent.document.url).pathname}`);
    });
    expect(visited).to.eql(["undefined in /a under undefined", "local in /a under /a", "other in /b under /a", "c in /b under /b"]);
  });

  test("a reference that's followed is caused by the document it's in", async () => {
    const { session } = site({ "/a": { b: { $ref: "/b" } }, "/b": { c: { $ref: "/c" } }, "/c": 1 });
    const trace = new Trace(session);
    await jrefSelect(session, "> [key=b] > [key=c]", await browse(session, "https://a.test/a"));
    expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /a", "1 /b", "2 /c"]);
  });

  test("a reference in a node the session doesn't have is still followed", async () => {
    const { session } = site({ "/b": 1 });
    const mine = await parsed(`{ "b": { "$ref": "/b" } }`, "https://a.test/mine");
    expect(toJson(await childNode(session, "b", mine))).to.equal(`1`);
  });

  describe("a walk that starts at a reference", () => {
    test("a visit starts at what it leads to", async () => {
      const { session, requests } = site({
        "/a": { b: { $ref: "/b" } },
        "/b": { c: 1 }
      });
      const reference = await memberOf(session, "https://a.test/a", "b");
      /** @type string[] */
      const visited = [];
      await jrefVisit(session, reference, ({ node }, key, parent, depth) => {
        visited.push(`${depth} ${key} ${parent === undefined} ${toJson(node)}`);
      });
      expect(visited).to.eql([`0 undefined true {"c":1}`, `1 c false 1`]);
      expect(requests).to.eql(["/a", "/b"]);
    });

    test("a selection and a find start at what it leads to", async () => {
      const { session } = site({
        "/a": { b: { $ref: "/b" } },
        "/b": { $ref: "/c" },
        "/c": { name: "c" }
      });
      const reference = await memberOf(session, "https://a.test/a", "b");
      const name = await jrefSelect(session, "> [key=name]", reference);
      expect(name && toJson(name.node)).to.equal(`"c"`);
      const root = await jrefSelect(session, ":root", reference);
      expect(root?.node.location).to.equal("https://a.test/c#");
      const found = await jrefFind(session, reference, { jsonType: "string" });
      expect(found && toJson(found.node)).to.equal(`"c"`);
    });

    test("it's caused by the document it's in", async () => {
      const { session } = site({ "/a": { b: { $ref: "/b" } }, "/b": 1 });
      const trace = new Trace(session);
      await jrefSelect(session, ":root", await memberOf(session, "https://a.test/a", "b"));
      expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /a", "1 /b"]);
    });

    test("a selector that isn't one throws before it's followed", async () => {
      const { session, requests } = site({ "/a": { b: { $ref: "/b" } }, "/b": 1 });
      const reference = await memberOf(session, "https://a.test/a", "b");
      await expect(jrefSelect(session, ":has(a)", reference)).rejects.toThrow(SyntaxError);
      await expect(jrefVisit(session, reference, () => {}, { maxDepth: -1 })).rejects.toThrow(RangeError);
      expect(requests).to.eql(["/a"]);
    });
  });

  describe("embedded documents", () => {
    test("a reference in a node of an embedded document finds what its container has", async () => {
      const { session, requests } = site({
        "/bundle": { main: { x: { $ref: "/x" } }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "the bundle's" } },
        "/y": "the real one"
      });
      const x = await child(session, "x", await browse(session, "https://a.test/bundle"));
      expect(x.node.location).to.equal("https://a.test/x#");
      expect(x.document, "its document is its container").to.equal((await browse(session, "https://a.test/bundle", { reference: "manual" })).document);
      expect(toJson(await childNode(session, "y", x))).to.equal(`"the bundle's"`);
      expect(requests).to.eql(["/bundle"]);
    });

    test("when two documents contain a document with the same URL, each one's nodes find their own", async () => {
      const { session, requests } = site({
        "/one": { main: { $ref: "/x" }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "one's" } },
        "/two": { main: { $ref: "/x" }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "two's" } }
      });
      const one = await browse(session, "https://a.test/one");
      const two = await browse(session, "https://a.test/two");
      expect(toJson(await childNode(session, "y", two))).to.equal(`"two's"`);
      expect(toJson(await childNode(session, "y", one))).to.equal(`"one's"`);
      expect(requests).to.eql(["/one", "/two"]);
    });

    test("what an embedded document's node refers to that isn't contained is caused by its container", async () => {
      const { session } = site({
        "/bundle": { main: { $ref: "/x" }, embedded: { "https://a.test/x": { other: { $ref: "/other" } } } },
        "/other": 1
      });
      const trace = new Trace(session);
      await child(session, "other", await browse(session, "https://a.test/bundle"));
      expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /bundle", "1 /other"]);
    });
  });
});

/**
 * The target of a node's property, which has to be there
 *
 * @type (session: DocumentSession, key: string, target: Start<JrefNode>) => Promise<Target<unknown, FollowedNode>>
 */
const child = async (session, key, target) => {
  const found = await jrefSelect(session, `> [key=${key}]`, target);
  if (found === undefined) {
    throw Error(`No '${key}'`);
  }

  return /** @type Target<unknown, FollowedNode> */ (found);
};

/** @type (session: DocumentSession, key: string, target: Start<JrefNode>) => Promise<FollowedNode> */
const childNode = async (session, key, target) => (await child(session, key, target)).node;

/**
 * A member of the document at a URL as it's written, which can be a
 * reference, with its document
 *
 * @type (session: DocumentSession, url: string, key: string) => Promise<Target<unknown, JrefNode>>
 */
const memberOf = async (session, url, key) => {
  const target = /** @type Target<unknown, FollowedNode> */ (await browse(session, url));
  return /** @type Target<unknown, JrefNode> */ (await jrefStep(session, key, target, { reference: "manual" }));
};

/** @type (value: Json, url: string) => JrefNode */
const jrefNode = (value, url) => /** @type JrefNode */ (fromJref(JSON.stringify(value), url).document.children[0]);

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

/**
 * A JRef document the session didn't retrieve
 *
 * @type (text: string, url: string) => Promise<JrefMediaTypeDocument>
 */
const parsed = (text, url) => jrefMediaType.parse({ text: async () => text, url });
