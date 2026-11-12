import { describe, test, expect } from "vitest";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { get, getDocument } from "./documents.js";
import { Hyperjump } from "../hyperjump.js";
import { fetcher } from "../layers.js";
import { jsonValue, JsonPointerError } from "../json/jsonast-util.js";
import { jrefMediaType } from "../media-types/jref-media-type.js";
import { nodeTransport } from "../transports/node-transport.js";
import { Trace } from "../trace.js";

/**
 * @import { HyperjumpConfig } from "../hyperjump.d.ts"
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

    test("a document from the web can't refer to a file", async () => {
      const { session } = site({ "/a": [`{ "$ref": "file:///project/secret.json" }`, jref] }, { allowRetrieval: ["https://a.test/", "file:///project/"] });
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

    test("a fragment that doesn't identify a value is a JsonPointerError", async () => {
      const { session } = site({ "/a": [`{}`, jref] });
      await expect(get(session, "https://a.test/a#/b")).rejects.toThrow(JsonPointerError);
    });
  });
});

/**
 * A session on a pretend site at `https://a.test`, which answers each path
 * with a body, headers, and a status, and keeps the requests it got
 *
 * @type (
 *   pages: Record<string, [string | null, Record<string, string>, number?]>,
 *   config?: HyperjumpConfig
 * ) => { session: Hyperjump, config: HyperjumpConfig, requests: Request[] }
 */
const site = (pages, extra = {}) => {
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
  const config = { stack, allowRetrieval: ["https://a.test/"], ...extra };
  return { session: new Hyperjump(config), config, requests };
};
