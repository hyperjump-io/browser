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
 * for their URLs. An embedded document's nodes are the bundle's, so their
 * locations are in the bundle.
 *
 * @type (embedded: Record<string, string>) => MediaTypePlugin<DocumentNode>
 */
const bundlePlugin = (embedded) => ({
  mediaType: bundleType,
  extensions: [],
  parse: async (response) => {
    const result = fromJref(await response.text(), response.url);
    if (result.status !== "success") {
      throw Error("Not JRef");
    }

    /** @type (url: string, node: import("../jref/jref-ast.d.ts").JrefNode) => DocumentNode */
    const document = (url, node) => ({ type: "jref-document", children: [node], url, mediaType: "application/reference+json" });
    return {
      ...document(response.url, result.node),
      embedded: Object.fromEntries(Object.entries(embedded).map(([url, pointer]) => [url, document(url, jsonPointerGet(pointer, result.node))]))
    };
  }
});

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

/** @type (embedded: Record<string, string>, requested?: string[]) => Hyperjump */
const withBundle = (embedded, requested = []) => new Hyperjump({
  allowRetrieval: ["foo:/bundle", "foo:/other"],
  urlSchemePlugins: [fooPlugin({
    "foo:/bundle": [bundleType, bundle],
    "foo:/other": ["application/reference+json", `{ "$ref": "foo:/a#/bar" }`],
    "foo:/a": ["application/reference+json", `{ "bar": 24 }`]
  }, requested)],
  mediaTypePlugins: [bundlePlugin(embedded)]
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
