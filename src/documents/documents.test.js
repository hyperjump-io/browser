import { describe, test, expect } from "vitest";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { get, getDocument } from "./documents.js";
import { Hyperjump } from "../hyperjump.js";
import { fetcher } from "../layers.js";
import { jsonValue } from "../json/jsonast-util.js";
import { coded } from "../test-helpers/errors.js";
import { defaultMediaTypes } from "../media-types/media-types.js";
import { jrefMediaType } from "../media-types/jref-media-type.js";
import { fromJref } from "../jref/jref-util.js";
import { nodeTransport } from "../transports/node-transport.js";
import { scheduler } from "../layers/scheduler.js";
import { PriorityController } from "../priority.js";
import { controlled, tick } from "../test-helpers/controlled.js";
import { Trace } from "../trace.js";

/**
 * @import { HyperjumpConfig } from "../hyperjump.d.ts"
 * @import { Json, JsonNode } from "../json/jsonast.d.ts"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "../media-types/media-types.d.ts"
 */

const jref = { "content-type": "application/reference+json" };
const json = { "content-type": "application/json" };

describe("documents", () => {
  describe("getDocument", () => {
    test("retrieves a document and parses it with the plugin for its Content-Type", async () => {
      const { session } = site({ "/a": [`{ "b": { "$ref": "/b" } }`, jref] });
      const document = await getDocument(session, "https://a.test/a#/b");
      expect(document).to.include({ type: "jref-document", url: "https://a.test/a" });
      expect(document.children[0]).to.include({ location: "https://a.test/a#" });
    });

    test("the request's Accept header lists the session's media types", async () => {
      const { session, requests } = site({ "/a": [`1`, json] });
      await getDocument(session, "https://a.test/a");
      expect(requests[0].headers.get("accept")).to.equal("application/reference+json, application/json, */*; q=0.001");

      const other = site({ "/a": [`1`, jref] }, { mediaTypes: [{ ...jrefMediaType, quality: 0.5 }] });
      await getDocument(other.session, "https://a.test/a");
      expect(other.requests[0].headers.get("accept")).to.equal("application/reference+json; q=0.5, */*; q=0.001");
    });

    test("a session keeps a document, so it's fetched once, even when it's asked for at the same time", async () => {
      const { session, requests } = site({ "/a": [`1`, json] });
      const [first, second] = await Promise.all([getDocument(session, "https://a.test/a"), getDocument(session, "https://a.test/a#/x")]);
      expect(second).to.equal(first);
      expect(await getDocument(session, "https://a.test/a")).to.equal(first);
      expect(requests.length).to.equal(1);
    });

    test("another session fetches it again", async () => {
      const { config, requests } = site({ "/a": [`1`, json] });
      const first = await getDocument(new Hyperjump(config), "https://a.test/a");
      const second = await getDocument(new Hyperjump(config), "https://a.test/a");
      expect(second).not.to.equal(first);
      expect(requests.length).to.equal(2);
    });

    test("a document is also kept under the URL its response came from", async () => {
      const { session, requests } = site({
        "/old": [null, { location: "/new" }, 302],
        "/new": [`1`, json]
      });
      const moved = await getDocument(session, "https://a.test/old");
      expect(moved.url).to.equal("https://a.test/new");
      expect(await getDocument(session, "https://a.test/new")).to.equal(moved);
      expect(requests.map((request) => new URL(request.url).pathname)).to.eql(["/old", "/new"]);
    });

    test("a document that was already reached another way is the same document", async () => {
      const { session } = site({
        "/old": [null, { location: "/new" }, 302],
        "/new": [`1`, json]
      });
      const direct = await getDocument(session, "https://a.test/new");
      expect(await getDocument(session, "https://a.test/old")).to.equal(direct);
    });

    test("a document is kept under its response's URL, not the URL it says it has", async () => {
      /** @type MediaTypePlugin<DocumentNode<JrefNode>> */
      const selfIdentified = {
        mediaType: "application/x-self-identified",
        extensions: [],
        parse: async (response) => {
          const text = await response.text();
          const url = /** @type {{ id: string }} */ (JSON.parse(text)).id;
          const node = /** @type JrefNode */ (fromJref(text, url).node);
          return { type: "self-identified-document", children: [node], url };
        }
      };
      const { session, requests } = site({
        "/claims": [`{ "id": "https://a.test/real" }`, { "content-type": "application/x-self-identified" }],
        "/real": [`"the real one"`, json]
      }, { mediaTypes: [...defaultMediaTypes, selfIdentified] });
      const claims = await getDocument(session, "https://a.test/claims");
      expect(claims.url).to.equal("https://a.test/real");
      expect(jsonValue(await get(session, "https://a.test/real"))).to.equal("the real one");
      expect(await getDocument(session, "https://a.test/claims")).to.equal(claims);
      expect(requests.map((request) => new URL(request.url).pathname)).to.eql(["/claims", "/real"]);
    });

    test("a plugin gets the response's headers, and the session to get what the document needs", async () => {
      /** @type MediaTypePlugin */
      const described = {
        mediaType: "application/x-described",
        extensions: [],
        parse: async (response, session) => {
          const describedBy = /describedby="([^"]*)"/.exec(response.headers.get("content-type") ?? "")?.[1] ?? "";
          const description = await getDocument(session, new URL(describedBy, response.url), { initiator: response });
          return { type: "described-document", children: [fromJref(await response.text(), response.url).node, ...description.children], url: response.url };
        }
      };
      const { session } = site({
        "/a": [`1`, { "content-type": `application/x-described; describedby="/description"` }],
        "/description": [`"a number"`, json]
      }, { mediaTypes: [...defaultMediaTypes, described] });
      const trace = new Trace(session);
      const document = await getDocument(session, "https://a.test/a#ignored");
      expect(document.url).to.equal("https://a.test/a");
      expect(document.children.map((node) => jsonValue(/** @type JsonNode */ (node)))).to.eql([1, "a number"]);
      expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /a", "1 /description"]);
    });

    test("a response a layer gave a URL that can't be defined again is parsed", async () => {
      const session = new Hyperjump({
        stack: fetcher((request) => {
          const response = new Response(`1`, { headers: json });
          Object.defineProperty(response, "url", { value: request.url });
          return response;
        }),
        allowRetrieval: ["https://a.test/"]
      });
      expect((await getDocument(session, "https://a.test/a")).url).to.equal("https://a.test/a");
    });

    test("a relative URL is resolved against the session's context URL", async () => {
      const session = new Hyperjump();
      const document = await getDocument(session, "package.json");
      expect(document.url).to.equal(new URL("package.json", session.contextUrl).href);
      expect(document.type).to.equal("json-document");
    });

    test("a file is parsed by the plugin for its extension, and a symlink is its file", async () => {
      const directory = await mkdtemp(join(tmpdir(), "browser-documents-"));
      await writeFile(join(directory, "a.jref"), `{ "$ref": "b.json" }`);
      await symlink(join(directory, "a.jref"), join(directory, "link.json"));
      const session = new Hyperjump({ stack: nodeTransport(), allowRetrieval: [pathToFileURL(directory + "/").href] });

      const document = await getDocument(session, pathToFileURL(join(directory, "link.json")));
      expect(document).to.include({ type: "jref-document", url: pathToFileURL(join(directory, "a.jref")).href });
      expect(await getDocument(session, pathToFileURL(join(directory, "a.jref")))).to.equal(document);
    });

    test("a response that isn't a success is an error with its status", async () => {
      const { session } = site({ "/missing": [`{}`, json, 404] });
      const loading = getDocument(session, "https://a.test/missing");
      await expect(loading).rejects.toThrow("'https://a.test/missing' can't be used, because its response's status is 404");
      await expect(loading).rejects.toMatchObject({ cause: { code: "ERR_HTTP_STATUS", status: 404 }, url: "https://a.test/missing" });
    });

    test("a response no plugin parses is an error", async () => {
      const { session } = site({ "/text": [`hi`, { "content-type": "text/plain" }], "/none": [null, {}] });
      const loading = getDocument(session, "https://a.test/text");
      await expect(loading).rejects.toThrow("no media type parses its 'Content-Type', which is 'text/plain'. Use the session's 'mediaTypes' to add support for a media type.");
      await expect(loading).rejects.toMatchObject({ cause: { code: "ERR_UNSUPPORTED_MEDIA_TYPE" }, url: "https://a.test/text" });
      await expect(getDocument(session, "https://a.test/none")).rejects.toThrow("which is missing");
      await expect(getDocument(new Hyperjump(), "README.md")).rejects.toThrow("'README.md' can't be used, because no media type has its extension");
    });

    test("a network error and a syntax error are as they are", async () => {
      const { session } = site({ "/bad": [`{ "a": 1, }`, json] });
      await expect(getDocument(session, "https://b.test/a")).rejects.toMatchObject({ cause: { code: "ERR_RETRIEVAL_NOT_ALLOWED" } });
      await expect(getDocument(session, "https://a.test/bad")).rejects.toThrow(SyntaxError);
      await expect(getDocument(session, "https://a.test/bad")).rejects.toThrow(coded("ERR_SYNTAX", "https://a.test/bad"));
    });

    test("a document that fails isn't kept, and its body isn't left open", async () => {
      let cancelled = false;
      let attempts = 0;
      const session = new Hyperjump({
        stack: fetcher(() => {
          attempts++;
          const body = new ReadableStream({ cancel: () => {
            cancelled = true;
          } });
          return new Response(body, { headers: { "content-type": "text/plain" } });
        }),
        allowRetrieval: ["https://a.test/"]
      });
      await expect(getDocument(session, "https://a.test/a")).rejects.toMatchObject({ cause: { code: "ERR_UNSUPPORTED_MEDIA_TYPE" } });
      expect(cancelled).to.equal(true);
      await expect(getDocument(session, "https://a.test/a")).rejects.toThrow();
      expect(attempts).to.equal(2);
    });

    test("a quality that isn't one throws when the session first gets a document", async () => {
      const { session } = site({}, { mediaTypes: [{ ...jrefMediaType, quality: 2 }] });
      await expect(getDocument(session, "https://a.test/a")).rejects.toThrow(RangeError);
    });
  });

  describe("get", () => {
    test("is the document's root without a fragment, and the node a fragment identifies", async () => {
      const { session } = site({ "/a": [`{ "b": [1, { "c d": 2 }] }`, jref] });
      expect(jsonValue(await get(session, "https://a.test/a"))).to.eql({ b: [1, { "c d": 2 }] });
      expect(jsonValue(await get(session, "https://a.test/a#/b/1/c%20d"))).to.equal(2);
    });

    test("a fragment of a media type without fragments identifies the whole document", async () => {
      const { session } = site({ "/a": [`{ "b": 1 }`, json] });
      expect(jsonValue(await get(session, "https://a.test/a#/b"))).to.eql({ b: 1 });
    });

    test("follows a reference, and any it leads to, until there's a value", async () => {
      const { session, requests } = site({
        "/a": [`{ "b": { "$ref": "/b#/c" } }`, jref],
        "/b": [`{ "c": { "$ref": "#/d" }, "d": { "$ref": "c" } }`, jref],
        "/c": [`"here"`, json]
      });
      const node = await get(session, "https://a.test/a#/b");
      expect(node).to.include({ type: "json", location: "https://a.test/c#" });
      expect(jsonValue(node)).to.equal("here");
      expect(requests.map((request) => new URL(request.url).pathname)).to.eql(["/a", "/b", "/c"]);
    });

    test("a reference in a JSON document isn't one", async () => {
      const { session } = site({ "/a": [`{ "$ref": "/b" }`, json] });
      expect(jsonValue(await get(session, "https://a.test/a"))).to.eql({ $ref: "/b" });
    });

    test("a reference that's followed is caused by the document it's in", async () => {
      const { session } = site({
        "/a": [`{ "$ref": "/b" }`, jref],
        "/b": [`{ "$ref": "/c" }`, jref],
        "/c": [`1`, json]
      });
      const trace = new Trace(session);
      await get(session, "https://a.test/a");
      expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /a", "1 /b", "2 /c"]);
    });

    test("a document with a reference that's an absolute file: URL can't be used", async () => {
      const { session, requests } = site({ "/a": [`{ "a": 1, "b": { "$ref": "file:///project/secret.json" } }`, jref] }, { allowRetrieval: ["https://a.test/", "file:///project/"] });
      const getting = get(session, "https://a.test/a#/a");
      await expect(getting).rejects.toThrow(SyntaxError);
      await expect(getting).rejects.toThrow("A reference can't be an absolute file: URL. Use a relative reference to refer to a file. at https://a.test/a:1:26");
      await expect(getting).rejects.toMatchObject({ cause: { ruleId: "absolute-file-reference" } });
      expect(requests.length).to.equal(1);
    });

    test("a document from the web can't refer to a file, whatever its media type says", async () => {
      /** @type MediaTypePlugin */
      const linkMediaType = {
        mediaType: "text/x-link",
        extensions: [],
        parse: async (response) => ({
          type: "link-document",
          children: [{ type: "reference", href: await response.text(), jsonType: "object", children: [], location: `${response.url}#` }],
          url: response.url
        })
      };
      const { session } = site({ "/a": [`file:///project/secret.json`, { "content-type": "text/x-link" }] }, {
        mediaTypes: [linkMediaType],
        allowRetrieval: ["https://a.test/", "file:///project/"]
      });
      await expect(get(session, "https://a.test/a")).rejects.toMatchObject({ cause: { code: "ERR_FILE_REFERENCE_NOT_ALLOWED" } });
    });

    test("references that lead back to one already followed are an error", async () => {
      const { session } = site({
        "/a": [`{ "b": { "$ref": "/b" } }`, jref],
        "/b": [`{ "$ref": "/a#/b" }`, jref],
        "/self": [`{ "$ref": "" }`, jref]
      });
      const following = get(session, "https://a.test/a#/b");
      await expect(following).rejects.toThrow("Following references led back to 'https://a.test/a#/b'");
      await expect(following).rejects.toMatchObject({
        cause: { code: "ERR_REFERENCE_CYCLE", chain: ["https://a.test/a#/b", "https://a.test/b#", "https://a.test/a#/b"] }
      });
      await expect(get(session, "https://a.test/self")).rejects.toMatchObject({ cause: { code: "ERR_REFERENCE_CYCLE" } });
    });

    test("a fragment that doesn't identify a value is an error with a code and its location", async () => {
      const { session } = site({ "/a": [`{}`, jref] });
      await expect(get(session, "https://a.test/a#/b")).rejects.toThrow(coded("ERR_POINTER_NOT_FOUND", "https://a.test/a#/b"));
    });
  });

  describe("priority", () => {
    test("a document is fetched with the priority it's asked for, and so are the references that are followed", async () => {
      /** @type string[] */
      const seen = [];
      const session = new Hyperjump({
        stack: fetcher((request, ctx) => {
          const path = new URL(request.url).pathname;
          seen.push(`${path} ${ctx.priority.value}`);
          return new Response(path === "/a" ? `{ "$ref": "/b" }` : `1`, { headers: jref });
        }),
        allowRetrieval: ["https://a.test/"]
      });
      await get(session, "https://a.test/a", { priority: "low" });
      await getDocument(session, "https://a.test/c", { priority: "high" });
      await get(session, "https://a.test/d");
      expect(seen).to.eql(["/a low", "/b low", "/c high", "/d auto"]);
    });

    test("a document that's waited for again has the most urgent priority of whoever is waiting", async () => {
      const net = controlled();
      const session = new Hyperjump({ stack: scheduler({ perKey: 1 })(net.transport), allowRetrieval: ["https://a.test/"] });
      const blocker = session.fetch("https://a.test/blocker");
      const preloaded = getDocument(session, "https://a.test/preloaded", { priority: "low" });
      const other = session.fetch("https://a.test/other");
      await tick();
      expect(net.started, "both wait for the one connection").to.eql(["a.test/blocker"]);

      const needed = getDocument(session, "https://a.test/preloaded", { priority: "high" });
      await tick();
      net.answer("a.test/blocker");
      await (await blocker).text();
      await tick();
      expect(net.started.at(-1), "it went ahead of the request that came after it").to.equal("a.test/preloaded");

      net.answer("a.test/preloaded", `1`, { headers: json });
      expect(await needed).to.equal(await preloaded);
      await tick();
      net.answer("a.test/other");
      await (await other).text();
    });

    test("a priority can change while a document waits", async () => {
      const net = controlled();
      const session = new Hyperjump({ stack: scheduler({ perKey: 1 })(net.transport), allowRetrieval: ["https://a.test/"] });
      const blocker = session.fetch("https://a.test/blocker");
      const priority = new PriorityController("low");
      const document = getDocument(session, "https://a.test/a", { priority: priority.signal });
      const other = session.fetch("https://a.test/other");
      await tick();
      priority.set("high");
      net.answer("a.test/blocker");
      await (await blocker).text();
      await tick();
      expect(net.started.at(-1)).to.equal("a.test/a");
      net.answer("a.test/a", `1`, { headers: json });
      await document;
      await tick();
      net.answer("a.test/other");
      await (await other).text();
    });
  });

  describe("embedded documents", () => {
    const bundled = { "content-type": "application/x-bundle" };
    const mediaTypes = [...defaultMediaTypes, bundleMediaType];

    test("a reference finds a document its document contains, without fetching it", async () => {
      const { session, requests } = site({
        "/bundle": [bundle({ $ref: "https://elsewhere.test/b#/c" }, { "https://elsewhere.test/b": { c: 42 } }), bundled]
      }, { mediaTypes });
      const node = await get(session, "https://a.test/bundle");
      expect(jsonValue(node)).to.equal(42);
      expect(node.location).to.equal("https://elsewhere.test/b#/c");
      expect(requests.map((request) => request.url), "allowRetrieval doesn't apply to what isn't retrieved").to.eql(["https://a.test/bundle"]);
    });

    test("an embedded document finds the others its container has, and its container", async () => {
      const { session, requests } = site({
        "/bundle": [bundle({ a: { $ref: "/x" }, end: "here" }, {
          "https://a.test/x": { $ref: "/y" },
          "https://a.test/y": { $ref: "/bundle#/end" }
        }), bundled]
      }, { mediaTypes });
      expect(jsonValue(await get(session, "https://a.test/bundle#/a"))).to.equal("here");
      expect(requests.length).to.equal(1);
    });

    test("what an embedded document refers to that isn't contained is fetched, caused by its container", async () => {
      const { session } = site({
        "/bundle": [bundle({ $ref: "/x" }, { "https://a.test/x": { $ref: "/other" } }), bundled],
        "/other": [`1`, json]
      }, { mediaTypes });
      const trace = new Trace(session);
      expect(jsonValue(await get(session, "https://a.test/bundle"))).to.equal(1);
      expect(trace.tree().map(({ record, depth }) => `${depth} ${new URL(record.url).pathname}`)).to.eql(["0 /bundle", "1 /other"]);
    });

    test("a document that isn't a file can't say it contains a file", async () => {
      const { session } = site({
        "/bundle": [bundle(1, { "file:///project/a.json": { $ref: "secret.json" } }), bundled]
      }, { mediaTypes, allowRetrieval: ["https://a.test/", "file:///project/"] });
      const loading = getDocument(session, "https://a.test/bundle");
      await expect(loading).rejects.toThrow("'https://a.test/bundle' can't be used, because it says it contains a document with an absolute file: URL");
      await expect(loading).rejects.toMatchObject({ cause: { code: "ERR_ABSOLUTE_FILE_URL" }, url: "https://a.test/bundle" });
    });

    test("a file can contain files, and they can refer to files", async () => {
      const session = new Hyperjump({
        stack: fetcher((request) => request.url.endsWith("/bundle")
          ? new Response(bundle({ $ref: "a.json" }, { "file:///project/a.json": { $ref: "b.json" } }), { headers: bundled })
          : new Response(`"b"`)),
        mediaTypes: [{ ...bundleMediaType, extensions: ["/bundle"] }, ...defaultMediaTypes],
        allowRetrieval: ["file:///project/"]
      });
      expect(jsonValue(await get(session, "file:///project/bundle"))).to.equal("b");
    });

    test("only references from the container find it, so it doesn't change what other documents get", async () => {
      const { session, requests } = site({
        "/bundle": [bundle({ $ref: "/x" }, { "https://a.test/x": "the bundle's" }), bundled],
        "/other": [`{ "$ref": "/x" }`, jref],
        "/x": [`"the real one"`, json]
      }, { mediaTypes });
      expect(jsonValue(await get(session, "https://a.test/bundle"))).to.equal("the bundle's");
      expect(jsonValue(await get(session, "https://a.test/other"))).to.equal("the real one");
      expect(jsonValue(await get(session, "https://a.test/x")), "it isn't kept under its own URL").to.equal("the real one");
      expect(jsonValue(await get(session, "https://a.test/bundle")), "and the container still finds its own").to.equal("the bundle's");
      expect(requests.map((request) => new URL(request.url).pathname)).to.eql(["/bundle", "/other", "/x"]);
    });

    test("its URL is compared as a URL, without a fragment", async () => {
      const { session } = site({
        "/bundle": [bundle({ $ref: "/docs/../x#/a" }, { "HTTPS://a.test/x#ignored": { a: 1 } }), bundled]
      }, { mediaTypes });
      expect(jsonValue(await get(session, "https://a.test/bundle"))).to.equal(1);
    });

    test("a document that says it contains something that isn't a URL can't be used", async () => {
      const { session } = site({ "/bundle": [bundle(1, { "not a url": 2 }), bundled] }, { mediaTypes });
      await expect(getDocument(session, "https://a.test/bundle")).rejects.toThrow(TypeError);
    });
  });
});

/**
 * A made-up format with embedded documents: JSON with a `main` JRef value
 * and the JRef values it contains by URL
 *
 * @type (main: Json, embedded: Record<string, Json>) => string
 */
const bundle = (main, embedded) => JSON.stringify({ main, embedded });

/** @type (value: Json, url: string) => JrefNode */
const jrefNode = (value, url) => /** @type JrefNode */ (fromJref(JSON.stringify(value), url).node);

/** @type MediaTypePlugin<DocumentNode<JrefNode>> */
const bundleMediaType = {
  mediaType: "application/x-bundle",
  extensions: [],
  parse: async (response) => {
    const { main, embedded } = /** @type {{ main: Json, embedded: Record<string, Json> }} */ (JSON.parse(await response.text()));
    /** @type (value: Json, url: string) => DocumentNode<JrefNode> */
    const document = (value, url) => ({ type: "bundle-document", children: [jrefNode(value, url)], url });
    return {
      ...document(main, response.url),
      embedded: Object.fromEntries(Object.entries(embedded).map(([url, value]) => [url, document(value, URL.parse(url)?.href.split("#")[0] ?? "https://invalid.test/")]))
    };
  },
  fragmentPointer: (_document, fragment) => decodeURIComponent(fragment)
};

/**
 * A session on a pretend site at `https://a.test`, which answers each path
 * with a body, headers, and a status, and keeps the requests it got
 *
 * The session has the type of the configuration it's given, so the tests'
 * documents are what its media types make.
 *
 * @template {HyperjumpConfig} [C={}]
 * @param {Record<string, [string | null, Record<string, string>, number?]>} pages
 * @param {C} [extra]
 * @returns {{ session: Hyperjump<C>, config: C, requests: Request[] }}
 */
const site = (pages, extra) => {
  /** @type Request[] */
  const requests = [];
  const stack = fetcher((request) => {
    requests.push(request);
    const page = pages[new URL(request.url).pathname];
    if (!page) {
      return new Response(null, { status: 404 });
    }
    const [body, headers, status = 200] = page;
    return new Response(body, { status, headers });
  });
  const config = /** @type C */ ({ stack, allowRetrieval: ["https://a.test/"], ...extra });
  return { session: new Hyperjump(config), config, requests };
};
