import { describe, test, expect } from "vitest";
import { visit } from "unist-util-visit";
import { documentTarget, get } from "./documents.js";
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
    const target = await get(session, "https://a.test/a#/b");
    expect(jsonValue(target.node)).to.equal(1);
    expect(target.document).to.equal((await get(session, "https://a.test/a", { reference: "manual" })).document);
  });

  test("with reference: \"manual\", a reference isn't followed, so the target is in the document at the URL", async () => {
    const { session, requests } = site({ "/a": [`{ "$ref": "/b#/c" }`, jref], "/b": [`{ "c": 2 }`, jref] });
    const target = await get(session, "https://a.test/a", { reference: "manual" });
    expect(target.node).to.include({ type: "reference", href: "https://a.test/b#/c" });
    expect(target.document.url).to.equal("https://a.test/a");
    expect(requests).to.eql(["/a"]);
  });

  test("a reference is followed, so the document is the one the value is in", async () => {
    const { session } = site({ "/a": [`{ "$ref": "/b#/c" }`, jref], "/b": [`{ "c": 2 }`, jref] });
    const target = await get(session, "https://a.test/a");
    expect(jsonValue(target.node)).to.equal(2);
    expect(target.document).to.equal((await get(session, "https://a.test/b", { reference: "manual" })).document);
  });

  test("a reference from a target finds what the target's document contains, and the target has the container", async () => {
    const { session, requests } = site({
      "/bundle": [bundle({ a: { $ref: "/x" } }, { "https://a.test/x": "the bundle's" }), bundled],
      "/x": [`"the real one"`, jref]
    });
    const start = await get(session, "https://a.test/bundle");
    const [reference] = referencesIn(start);
    const target = await get(session, reference.href, { referencedFrom: start });
    expect(jsonValue(target.node)).to.equal("the bundle's");
    expect(target.document).to.equal(start.document);
    expect(requests).to.eql(["/bundle"]);
  });

  test("a target has its document's media type, and so does a target for a node in it", async () => {
    const { session } = site({
      "/bundle": [bundle({ a: { $ref: "/x" } }, { "https://a.test/x": 1 }), bundled],
      "/a": [`{ "b": 1 }`, jref]
    });
    const start = await get(session, "https://a.test/bundle", { reference: "manual" });
    expect(start.mediaType.mediaType).to.equal("application/x-bundle");
    expect((await get(session, "https://a.test/a")).mediaType.mediaType).to.equal("application/reference+json");

    const [reference] = referencesIn(start);
    expect(await jrefStep(session, "a", start, { reference: "manual" })).to.eql({ document: start.document, node: reference, mediaType: start.mediaType });
    expect((await get(session, reference.href, { referencedFrom: start })).mediaType, "a contained document has its container's").to.equal(start.mediaType);
  });

  test("a document the session didn't retrieve finds what it contains", async () => {
    const { session, requests } = site({ "/x": [`"the real one"`, jref] });
    const document = bundleDocument({ a: { $ref: "/x#/b" } }, "https://a.test/mine");
    const mine = documentTarget({ ...document, embedded: { "https://a.test/x": bundleDocument({ b: "mine" }, "https://a.test/x") } }, bundleMediaType);
    const [reference] = referencesIn(mine);
    const target = await get(session, reference.href, { referencedFrom: mine });
    expect(jsonValue(target.node)).to.equal("mine");
    expect(target.document, "its document is the container").to.equal(mine.document);
    expect(requests).to.eql([]);
    expect(jsonValue((await get(session, "https://a.test/x")).node), "and it doesn't answer for the URL").to.equal("the real one");
  });
});

/** @typedef {JrefNode & { type: "reference" }} JrefReferenceNode */

/**
 * Every reference under a target's node, as written
 *
 * @type (target: Target<unknown, JrefNode>) => JrefReferenceNode[]
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
const bundleDocument = (value, url) => ({ type: "bundle-document", children: [jrefNode(value, url)], url });

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
  },
  fragmentPointer: (_document, fragment) => decodeURIComponent(fragment)
};

/** @param {Record<string, [body: string, headers: Record<string, string>]>} pages */
const site = (pages) => {
  /** @type string[] */
  const requests = [];
  const stack = fetcher((request) => {
    const { pathname } = new URL(request.url);
    requests.push(pathname);
    const page = pages[pathname];
    return page ? new Response(page[0], { headers: page[1] }) : new Response(null, { status: 404 });
  });
  const session = new Hyperjump({ stack, allowRetrieval: ["https://a.test/"], mediaTypes: [...defaultMediaTypes, bundleMediaType] });
  return { session, requests };
};
