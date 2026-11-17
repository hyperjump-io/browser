import { describe, test, expect } from "vitest";
import { visit } from "unist-util-visit";
import { browse } from "./documents.js";
import { jrefStep } from "./step.js";
import { Hyperjump } from "../hyperjump.js";
import { fetcher } from "../layers.js";
import { jsonValue } from "../json/jsonast-util.js";
import { defaultMediaTypes } from "../media-types/media-types.js";
import { fromJref } from "../jref/jref-util.js";

/**
 * @import { Node } from "unist"
 * @import { Json } from "../json/jsonast.d.ts"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "../media-types/media-types.d.ts"
 * @import { Target } from "./documents.d.ts"
 */

const jref = { "content-type": "application/reference+json" };
const bundled = { "content-type": "application/x-bundle" };

describe("targets", () => {
  test("a target is the node a URL identifies, with the document it's in", async () => {
    const { session } = site({ "/a": [`{ "b": 1 }`, jref] });
    const target = await browse(session, "https://a.test/a#/b");
    expect(jsonValue(target.node)).to.equal(1);
    expect(target.document).to.equal((await browse(session, "https://a.test/a", { reference: "manual" })).document);
  });

  test("with reference: \"manual\", a reference isn't followed, so the target is in the document at the URL", async () => {
    const { session, requests } = site({ "/a": [`{ "$ref": "/b#/c" }`, jref], "/b": [`{ "c": 2 }`, jref] });
    const target = await browse(session, "https://a.test/a", { reference: "manual" });
    expect(target.node).to.include({ type: "reference", href: "https://a.test/b#/c" });
    expect(target.document.url).to.equal("https://a.test/a");
    expect(requests).to.eql(["/a"]);
  });

  test("a reference is followed, so the document is the one the value is in", async () => {
    const { session } = site({ "/a": [`{ "$ref": "/b#/c" }`, jref], "/b": [`{ "c": 2 }`, jref] });
    const target = await browse(session, "https://a.test/a");
    expect(jsonValue(target.node)).to.equal(2);
    expect(target.document).to.equal((await browse(session, "https://a.test/b", { reference: "manual" })).document);
  });

  test("a reference from a target finds what the target's document contains, and the target has the container", async () => {
    const { session, requests } = site({
      "/bundle": [bundle({ a: { $ref: "/x" } }, { "https://a.test/x": "the bundle's" }), bundled],
      "/x": [`"the real one"`, jref]
    });
    const start = await browse(session, "https://a.test/bundle");
    const [reference] = referencesIn(start);
    const target = await browse(session, reference.href, { referencedFrom: start });
    expect(jsonValue(target.node)).to.equal("the bundle's");
    expect(target.document).to.equal(start.document);
    expect(requests).to.eql(["/bundle"]);
  });

  test("a target is a node and its document, and so is a target for a node in it", async () => {
    const { session } = site({ "/bundle": [bundle({ a: { $ref: "/x" } }, { "https://a.test/x": 1 }), bundled] });
    const start = await browse(session, "https://a.test/bundle", { reference: "manual" });
    const [reference] = referencesIn(start);
    expect(await jrefStep(session, "a", start, { reference: "manual" })).to.eql({ document: start.document, node: reference });
  });

  test("a document the session didn't retrieve finds what it contains", async () => {
    const { session, requests } = site({ "/x": [`"the real one"`, jref] });
    const document = bundleDocument({ a: { $ref: "/x#/b" } }, "https://a.test/mine");
    const mine = { ...document, embedded: { "https://a.test/x": bundleDocument({ b: "mine" }, "https://a.test/x") } };
    const [reference] = referencesIn({ node: mine.children[0] });
    const target = await browse(session, reference.href, { referencedFrom: mine });
    expect(jsonValue(target.node)).to.equal("mine");
    expect(target.document, "its document is the container").to.equal(mine);
    expect(requests).to.eql([]);
    expect(jsonValue((await browse(session, "https://a.test/x")).node), "and it doesn't answer for the URL").to.equal("the real one");
  });

  test("a document the session didn't retrieve is judged by its URL, so one from the web can't refer to a file", async () => {
    const { session, requests } = site({ "/project/secret.json": [`"secret"`, jref] }, ["https://a.test/", "file:///project/"]);
    // JRef can't have an absolute file: reference, but a media type that
    // makes references itself can
    const web = linkDocument("file:///project/secret.json", "https://a.test/mine");
    const following = browse(session, web.children[0].href, { referencedFrom: web });
    await expect(following).rejects.toThrow(/Only a file: document can refer to a file: URL/);
    await expect(following).rejects.toMatchObject({ cause: { code: "ERR_FILE_REFERENCE_NOT_ALLOWED" } });
    expect(requests).to.eql([]);

    const file = bundleDocument({ a: { $ref: "secret.json" } }, "file:///project/mine.json");
    expect(jsonValue((await jrefStep(session, "a", file)).node)).to.equal("secret");
  });

  test("a document a document the session didn't retrieve contains is judged by its container's URL", async () => {
    const { session, requests } = site({ "/project/secret.json": [`"secret"`, jref] }, ["https://a.test/", "file:///project/"]);
    const contained = linkDocument("file:///project/secret.json", "https://a.test/x");
    const web = { ...bundleDocument({ a: { $ref: "/x" } }, "https://a.test/mine"), embedded: { "https://a.test/x": contained } };
    await expect(jrefStep(session, "a", web)).rejects.toMatchObject({ cause: { code: "ERR_FILE_REFERENCE_NOT_ALLOWED" } });
    expect(requests).to.eql([]);
  });

  test("a reference to a document's own URL finds the document, without retrieving it", async () => {
    const { session, requests } = site({ "/mine": [`{ "b": "the real one" }`, jref] });
    const mine = bundleDocument({ a: { $ref: "#/b" }, b: "mine" }, "https://a.test/mine");
    const a = await jrefStep(session, "a", mine);
    expect(jsonValue(a.node)).to.equal("mine");
    expect(a.document).to.equal(mine);
    expect(requests).to.eql([]);
    expect(jsonValue((await browse(session, "https://a.test/mine#/b")).node), "and it doesn't answer for the URL").to.equal("the real one");
  });

  test("a document is read from its root, like a target of it", async () => {
    const { session } = site({ "/x": [`{ "b": 1 }`, jref] });
    const mine = bundleDocument({ a: { $ref: "/x#/b" } }, "https://a.test/mine");
    const a = await jrefStep(session, "a", mine);
    expect(jsonValue(a.node)).to.equal(1);
    expect(await jrefStep(session, "a", mine, { reference: "manual" })).to.eql({ document: mine, node: referencesIn({ node: mine.children[0] })[0] });
  });
});

describe("fragments", () => {
  test("a document without anchors has no fragments, so any identifies the whole document", async () => {
    const { session } = site({});
    const mine = withoutAnchors({ a: 1 }, "https://a.test/mine");
    const from = { ...bundleDocument(null, "https://a.test/from"), embedded: { "https://a.test/mine": mine } };
    expect(jsonValue((await browse(session, "https://a.test/mine#/a", { referencedFrom: from })).node)).to.eql({ a: 1 });
  });

  test("an anchor identifies the node at its JSON Pointer, and anything else is a JSON Pointer", async () => {
    const { session } = site({});
    const mine = { ...bundleDocument({ a: { "b c": 1 } }, "https://a.test/mine"), anchors: { "here": "/a/b c", "/a": "" } };
    const from = { ...bundleDocument(null, "https://a.test/from"), embedded: { "https://a.test/mine": mine } };
    expect(jsonValue((await browse(session, "https://a.test/mine#here", { referencedFrom: from })).node)).to.equal(1);
    expect(jsonValue((await browse(session, "https://a.test/mine#/a/b%20c", { referencedFrom: from })).node)).to.equal(1);
    expect(jsonValue((await browse(session, "https://a.test/mine#/a", { referencedFrom: from })).node), "an anchor comes first").to.eql({ a: { "b c": 1 } });
    expect(jsonValue((await browse(session, "https://a.test/mine", { referencedFrom: from })).node)).to.eql({ a: { "b c": 1 } });
  });

  test("a fragment that isn't an anchor or a JSON Pointer is an error with a code", async () => {
    const { session } = site({});
    const mine = bundleDocument({ a: 1 }, "https://a.test/mine");
    const from = { ...bundleDocument(null, "https://a.test/from"), embedded: { "https://a.test/mine": mine } };
    const getting = browse(session, "https://a.test/mine#nowhere", { referencedFrom: from });
    await expect(getting).rejects.toThrow("There's no 'nowhere' anchor in 'https://a.test/mine'");
    await expect(getting).rejects.toMatchObject({ cause: { code: "ERR_ANCHOR_NOT_FOUND", anchor: "nowhere" }, url: "https://a.test/mine" });
  });

  test("a document a document contains has its own anchors", async () => {
    const { session } = site({});
    const contained = { ...bundleDocument({ a: 1 }, "https://a.test/x"), anchors: { here: "/a" } };
    const mine = { ...withoutAnchors(null, "https://a.test/mine"), embedded: { "https://a.test/x": contained } };
    expect(jsonValue((await browse(session, "https://a.test/x#here", { referencedFrom: mine })).node)).to.equal(1);
  });
});

/** @typedef {JrefNode & { type: "reference" }} JrefReferenceNode */

/**
 * Every reference under a target's node, as written
 *
 * @type (target: { node: JrefNode }) => JrefReferenceNode[]
 */
const referencesIn = (target) => {
  /** @type JrefReferenceNode[] */
  const references = [];
  visit(/** @type Node */ (target.node), "reference", (node) => {
    references.push(/** @type JrefReferenceNode */ (/** @type unknown */ (node)));
  });
  return references;
};

/** @type (main: Json, embedded: Record<string, Json>) => string */
const bundle = (main, embedded) => JSON.stringify({ main, embedded });

/** @type (value: Json, url: string) => DocumentNode<JrefNode> */
const bundleDocument = (value, url) => ({ type: "bundle-document", children: [jrefNode(value, url)], url, anchors: {} });

/**
 * A document that's a reference, made by a media type that makes references
 * itself, so it can be any URL
 *
 * @type (href: string, url: string) => DocumentNode<JrefNode & { type: "reference" }>
 */
const linkDocument = (href, url) => ({
  type: "link-document",
  children: [{ type: "reference", href, jsonType: "object", children: [], location: `${url}#` }],
  url
});

/**
 * A document whose media type has no fragments
 *
 * @type (value: Json, url: string) => DocumentNode<JrefNode>
 */
const withoutAnchors = (value, url) => ({ type: "plain-document", children: [jrefNode(value, url)], url });

/** @type (value: Json, url: string) => JrefNode */
const jrefNode = (value, url) => /** @type JrefNode */ (fromJref(JSON.stringify(value), url).node);

/** @type MediaTypePlugin<DocumentNode<JrefNode>> */
const bundleMediaType = {
  mediaType: "application/x-bundle",
  extensions: [],
  parse: async (response) => {
    const { main, embedded } = /** @type {{ main: Json, embedded: Record<string, Json> }} */ (JSON.parse(await response.text()));
    return {
      ...bundleDocument(main, response.url),
      embedded: Object.fromEntries(Object.entries(embedded).map(([url, value]) => [url, bundleDocument(value, url)]))
    };
  }
};

/**
 * @param {Record<string, [body: string, headers: Record<string, string>]>} pages
 * @param {string[]} [allowRetrieval]
 */
const site = (pages, allowRetrieval = ["https://a.test/"]) => {
  /** @type string[] */
  const requests = [];
  const stack = fetcher((request) => {
    const { pathname } = new URL(request.url);
    requests.push(pathname);
    const page = pages[pathname];
    return page ? new Response(page[0], { headers: page[1] }) : new Response(null, { status: 404 });
  });
  const session = new Hyperjump({ stack, allowRetrieval, mediaTypes: [...defaultMediaTypes, bundleMediaType] });
  return { session, requests };
};
