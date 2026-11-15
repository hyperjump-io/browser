import { describe, test, expect } from "vitest";
import { get } from "./documents.js";
import { jrefSelect } from "./select.js";
import { Hyperjump } from "../hyperjump.js";
import { fetcher } from "../layers.js";
import { fromJref } from "../jref/jref-util.js";
import { toJson } from "../json/jsonast-util.js";
import { defaultMediaTypes } from "../media-types/media-types.js";
import { Trace } from "../trace.js";

/**
 * @import { DocumentSession, FollowedNode } from "./documents.d.ts"
 * @import { HyperjumpConfig } from "../hyperjump.d.ts"
 * @import { Json } from "../json/jsonast.d.ts"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "../media-types/media-types.d.ts"
 */

describe("following references", () => {
  test("a walk follows a reference in the same document, and in another", async () => {
    const { session, requests } = site({
      "/a": { foo: 42, local: { $ref: "#/foo" }, other: { $ref: "/b#/bar" } },
      "/b": { bar: { $ref: "#/baz" }, baz: "here" }
    });
    const subject = await get(session, "https://a.test/a");
    expect(toJson(await child(session, "local", subject))).to.equal(`42`);
    const other = await child(session, "other", subject);
    expect(toJson(other)).to.equal(`"here"`);
    expect(other.location).to.equal("https://a.test/b#/baz");
    expect(requests).to.eql(["/a", "/b"]);
  });

  test("a reference that's followed is caused by the document it's in", async () => {
    const { session } = site({ "/a": { b: { $ref: "/b" } }, "/b": { c: { $ref: "/c" } }, "/c": 1 });
    const trace = new Trace(session);
    await jrefSelect(session, "> [key=b] > [key=c]", await get(session, "https://a.test/a"));
    expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /a", "1 /b", "2 /c"]);
  });

  test("a reference in a node the session doesn't have is still followed", async () => {
    const { session } = site({ "/b": 1 });
    const { node } = fromJref(`{ "b": { "$ref": "/b" } }`, "https://a.test/mine");
    expect(toJson(await child(session, "b", /** @type FollowedNode */ (node)))).to.equal(`1`);
  });

  describe("embedded documents", () => {
    test("a reference in a node of an embedded document finds what its container has", async () => {
      const { session, requests } = site({
        "/bundle": { main: { x: { $ref: "/x" } }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "the bundle's" } },
        "/y": "the real one"
      });
      const x = await child(session, "x", await get(session, "https://a.test/bundle"));
      expect(x.location).to.equal("https://a.test/x#");
      expect(toJson(await child(session, "y", x))).to.equal(`"the bundle's"`);
      expect(requests).to.eql(["/bundle"]);
    });

    test("when two documents contain a document with the same URL, each one's nodes find their own", async () => {
      const { session, requests } = site({
        "/one": { main: { $ref: "/x" }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "one's" } },
        "/two": { main: { $ref: "/x" }, embedded: { "https://a.test/x": { y: { $ref: "/y" } }, "https://a.test/y": "two's" } }
      });
      const one = await get(session, "https://a.test/one");
      const two = await get(session, "https://a.test/two");
      expect(toJson(await child(session, "y", two))).to.equal(`"two's"`);
      expect(toJson(await child(session, "y", one))).to.equal(`"one's"`);
      expect(requests).to.eql(["/one", "/two"]);
    });

    test("what an embedded document's node refers to that isn't contained is caused by its container", async () => {
      const { session } = site({
        "/bundle": { main: { $ref: "/x" }, embedded: { "https://a.test/x": { other: { $ref: "/other" } } } },
        "/other": 1
      });
      const trace = new Trace(session);
      await child(session, "other", await get(session, "https://a.test/bundle"));
      expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /bundle", "1 /other"]);
    });
  });
});

/**
 * The value of a node's property, which has to be there
 *
 * @type (session: DocumentSession, key: string, node: FollowedNode) => Promise<FollowedNode>
 */
const child = async (session, key, node) => {
  const found = await jrefSelect(session, `> [key=${key}]`, node);
  if (found === undefined) {
    throw Error(`No '${key}' in ${node.location}`);
  }

  return /** @type FollowedNode */ (found);
};

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
