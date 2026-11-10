import { describe, test, expect } from "vitest";
import { Hyperjump, RetrievalError } from "./index.js";
import { fromJref } from "../jref/jref-util.js";
import { jsonPointerGet, toJson } from "../json/jsonast-util.js";

/**
 * @import { DocumentNode, MediaTypePlugin, UrlSchemePlugin } from "./index.js"
 */

const bundleType = "application/bundle+json";

/**
 * A media type for JRef documents that embed others, at the pointers given
 * for their URLs. The bundle and the documents embedded in it share one set
 * of embedded documents. With `ownLocations`, an embedded document is parsed
 * on its own, so its nodes' locations start with its URL. Otherwise, they're
 * the bundle's nodes, with locations in the bundle.
 *
 * @type (embedded: Record<string, string>, ownLocations?: boolean) => MediaTypePlugin<DocumentNode>
 */
const bundlePlugin = (embedded, ownLocations = false) => ({
  mediaType: bundleType,
  extensions: [],
  parse: async (response) => {
    const text = await response.text();
    const result = fromJref(text, response.url);
    if (result.status !== "success") {
      throw Error("Not JRef");
    }

    /** @type Record<string, DocumentNode> */
    const set = {};
    /** @type (url: string, node: import("../jref/jref-ast.d.ts").JrefNode) => DocumentNode */
    const document = (url, node) => ({ type: "jref-document", children: [node], url, mediaType: "application/reference+json", embedded: set });
    for (const [url, pointer] of Object.entries(embedded)) {
      const node = jsonPointerGet(pointer, result.node);
      set[url] = document(url, ownLocations ? reparsed(text, node, url) : node);
    }
    return document(response.url, result.node);
  }
});

/**
 * A node's text parsed on its own, as the document at `url`
 *
 * @type (text: string, node: import("../jref/jref-ast.d.ts").JrefNode, url: string) => import("../jref/jref-ast.d.ts").JrefNode
 */
const reparsed = (text, node, url) => {
  const { start, end } = /** @type import("unist").Position */ (node.position);
  const result = fromJref(text.slice(start.offset, end.offset), url);
  if (result.status !== "success") {
    throw Error("Not JRef");
  }
  return result.node;
};

/**
 * A `foo:` plugin that answers with these documents, and records what's
 * requested
 *
 * @type (documents: Record<string, [string, string]>, requested: string[]) => UrlSchemePlugin
 */
const fooPlugin = (documents, requested) => ({
  schemes: ["foo"],
  retrieve: async ({ url }) => {
    requested.push(url);
    const [contentType, body] = documents[url];
    return new Response(body, { headers: { "content-type": contentType } });
  }
});

const bundle = `{
  "foo": { "$ref": "foo:/a#/bar" },
  "baz": { "$ref": "foo:/a#/baz" },
  "$defs": {
    "a": {
      "bar": 42,
      "baz": { "$ref": "foo:/b" }
    },
    "b": "b"
  }
}`;

/** @type (embedded: Record<string, string>, requested?: string[], ownLocations?: boolean) => Hyperjump */
const withBundle = (embedded, requested = [], ownLocations = false) => new Hyperjump({
  allowRetrieval: ["foo:/bundle", "foo:/other"],
  urlSchemePlugins: [fooPlugin({
    "foo:/bundle": [bundleType, bundle],
    "foo:/other": ["application/reference+json", `{ "$ref": "foo:/a#/bar" }`],
    "foo:/a": ["application/reference+json", `{ "bar": 24 }`]
  }, requested)],
  mediaTypePlugins: [bundlePlugin(embedded, ownLocations)]
});

describe("embedded documents", () => {
  test("a reference from the document that contains one finds it, without retrieving it", async () => {
    /** @type string[] */
    const requested = [];
    const subject = await withBundle({ "foo:/a": "/$defs/a" }, requested).session()
      .get("foo:/bundle#/foo");

    expect(toJson(subject)).to.equal(`42`);
    expect(requested).to.eql(["foo:/bundle"]);
  });

  test("a reference in an embedded document finds the others its container has", async () => {
    const subject = await withBundle({ "foo:/a": "/$defs/a", "foo:/b": "/$defs/b" }).session()
      .get("foo:/bundle#/baz");

    expect(toJson(subject)).to.equal(`"b"`);
  });

  test("an embedded document whose locations start with its own URL finds the others", async () => {
    const subject = await withBundle({ "foo:/a": "/$defs/a", "foo:/b": "/$defs/b" }, [], true).session()
      .get("foo:/bundle#/baz");

    expect(toJson(subject)).to.equal(`"b"`);
  });

  test("getDocument finds one from the document a reference is in", async () => {
    const session = withBundle({ "foo:/a": "/$defs/a" }).session();
    const bundle = await session.getDocument("foo:/bundle");
    const embedded = await session.getDocument("foo:/a", { referencedIn: bundle });

    expect(embedded).to.equal(bundle.embedded?.["foo:/a"]);
  });

  test("a reference from another document doesn't find it", async () => {
    const session = withBundle({ "foo:/a": "/$defs/a" }).session();
    await session.get("foo:/bundle#/foo");

    await expect(session.get("foo:/other")).rejects.toBeInstanceOf(RetrievalError);
  });

  test("it isn't the document at its URL", async () => {
    const session = withBundle({ "foo:/a": "/$defs/a" }).session();
    await session.get("foo:/bundle#/foo");

    await expect(session.getDocument("foo:/a")).rejects.toBeInstanceOf(RetrievalError);
  });

  test("its URL is parsed", async () => {
    const subject = await withBundle({ "FOO:/x/../a#frag": "/$defs/a" }).session()
      .get("foo:/bundle#/foo");

    expect(toJson(subject)).to.equal(`42`);
  });

  test("a URL that isn't a URL fails the retrieval", async () => {
    const session = withBundle({ "not a URL": "/$defs/a" }).session();
    await expect(session.get("foo:/bundle#/foo"))
      .rejects.toHaveProperty("cause", expect.objectContaining({ name: "TypeError" }));
  });
});
