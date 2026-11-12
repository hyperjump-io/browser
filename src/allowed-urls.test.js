import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { allows, realEntries, resolveAllowRetrieval } from "./allowed-urls.js";
import { Hyperjump } from "./hyperjump.js";
import { fetcher } from "./layers.js";
import { withUrl } from "./response-meta.js";
import { nodeTransport } from "./transports/node-transport.js";
import { defaultAllowRetrieval as nodeDefault } from "./context-url.js";
import { defaultAllowRetrieval as browserDefault } from "./context-url.browser.js";

/**
 * @import { FetchRecord } from "./fetch-record.d.ts"
 */

describe("allowRetrieval", () => {
  describe("entries", () => {
    test("one that ends with / allows what's under it, and any other only itself", async () => {
      const entries = resolveAllowRetrieval(["https://a.test/docs/", "https://a.test/page"], undefined, []);
      expect(await allowed(entries, "https://a.test/docs/x/y")).to.equal(true);
      expect(await allowed(entries, "https://a.test/docs")).to.equal(false);
      expect(await allowed(entries, "https://a.test/page#top"), "a URL's fragment isn't part of it").to.equal(true);
      expect(await allowed(entries, "https://a.test/page/x")).to.equal(false);
      expect(await allowed(entries, "https://a.test/docs/../secret"), "dot segments").to.equal(false);
    });

    test("an origin without a / allows everything on it", async () => {
      const entries = resolveAllowRetrieval(["https://a.test"], undefined, []);
      expect(await allowed(entries, "https://a.test/x/y")).to.equal(true);
      expect(await allowed(entries, "https://a.test.evil.test/")).to.equal(false);
    });

    test("an entry's fragment is ignored", () => {
      expect(resolveAllowRetrieval(["https://a.test/page#top"], undefined, [])).to.eql(["https://a.test/page"]);
    });

    test("an empty list allows nothing", async () => {
      expect(await allowed([], "https://a.test/")).to.equal(false);
    });

    test("a data: URL is always allowed, because nothing is fetched", async () => {
      expect(await allowed([], "data:text/plain,hi")).to.equal(true);
    });

    test("a relative entry is resolved against the base, and without one throws", () => {
      expect(resolveAllowRetrieval(["./docs/"], new URL("https://a.test/app/index.html"), [])).to.eql(["https://a.test/app/docs/"]);
      expect(() => resolveAllowRetrieval(["./docs/"], undefined, [])).to.throw(TypeError, /no base URL/);
      expect(() => resolveAllowRetrieval(["http://["], new URL("https://a.test/"), [])).to.throw(TypeError, /isn't a URL/);
    });

    test("the default is resolved against the base", () => {
      const page = new URL("https://a.test/app/index.html");
      expect(resolveAllowRetrieval(undefined, page, nodeDefault), "the directory, in Node.js").to.eql(["https://a.test/app/"]);
      expect(resolveAllowRetrieval(undefined, page, browserDefault), "the origin, in a browser").to.eql(["https://a.test/"]);
    });

    test("the default without a base is the error a check throws, not one thrown now", () => {
      const entries = resolveAllowRetrieval(undefined, undefined, ["./"]);
      expect(entries).to.be.instanceOf(TypeError);
      expect(/** @type TypeError */ (entries).message).to.contain("there's no base URL");
    });
  });

  describe("files", () => {
    /** A directory that's allowed */
    let inside = "";

    /** A directory that isn't */
    let outside = "";

    beforeAll(async () => {
      const directory = await realpath(await mkdtemp(join(tmpdir(), "browser-allow-")));
      inside = join(directory, "inside");
      outside = join(directory, "outside");
      await mkdir(inside);
      await mkdir(outside);
      await writeFile(join(inside, "inside.json"), "{}");
      await writeFile(join(outside, "outside.json"), "{}");
      await symlink(join(outside, "outside.json"), join(inside, "link.json"));
      await symlink(outside, join(inside, "linked-directory"));
      await symlink(inside, join(directory, "link-to-inside"));
    });

    afterAll(async () => {
      await rm(join(inside, ".."), { recursive: true, force: true });
    });

    test("the default is the working directory", async () => {
      const session = new Hyperjump({ stack: nodeTransport() });
      const response = await session.fetch(pathToFileURL(join(cwd(), "package.json")));
      expect(response.ok).to.equal(true);
      await response.body?.cancel();
      await expect(session.fetch(fileUrl(outside, "outside.json"))).rejects.toThrow(/isn't allowed/);
    });

    test("the default doesn't allow the network", async () => {
      const session = new Hyperjump({ stack: fetcher(() => new Response("fetched")) });
      const fetching = session.fetch("https://a.test/");
      await expect(fetching).rejects.toThrow("Fetching 'https://a.test/' isn't allowed. Add it to the session's 'allowRetrieval' to allow it.");
      await expect(fetching).rejects.toMatchObject({ cause: { code: "ERR_RETRIEVAL_NOT_ALLOWED" } });
    });

    test("a symlink to a file outside an allowed directory is refused", async () => {
      const session = new Hyperjump({ stack: nodeTransport(), allowRetrieval: [directoryUrl(inside)] });
      await expect(session.fetch(fileUrl(inside, "link.json"))).rejects.toThrow(/isn't allowed/);
      await expect(session.fetch(fileUrl(inside, "linked-directory", "outside.json"))).rejects.toThrow(/isn't allowed/);
      expect((await session.fetch(fileUrl(inside, "inside.json"))).ok).to.equal(true);
    });

    test("an entry is compared by its real path", async () => {
      const session = new Hyperjump({ stack: nodeTransport(), allowRetrieval: [directoryUrl(join(inside, "..", "link-to-inside"))] });
      expect((await session.fetch(fileUrl(inside, "inside.json"))).ok).to.equal(true);
      expect((await session.fetch(fileUrl(inside, "..", "link-to-inside", "inside.json"))).ok).to.equal(true);
    });

    test("a missing file in an allowed directory is missing, not refused", async () => {
      const session = new Hyperjump({ stack: nodeTransport(), allowRetrieval: [directoryUrl(inside)] });
      await expect(session.fetch(fileUrl(inside, "missing.json"))).rejects.toMatchObject({ cause: { code: "ENOENT" } });
    });

    test("a file: entry with a host is compared as it is", async () => {
      const entries = resolveAllowRetrieval(["file://example.com/share/"], undefined, []);
      expect(await allowed(entries, "file://example.com/share/document.json")).to.equal(true);
      expect(await allowed(entries, "file://example.com/other/document.json")).to.equal(false);
    });
  });

  describe("in a session", () => {
    test("a redirect to a URL it doesn't allow isn't followed", async () => {
      /** @type string[] */
      const fetched = [];
      const stack = fetcher((request) => {
        fetched.push(request.url);
        return new Response(null, { status: 302, headers: { location: "https://internal.test/secret" } });
      });
      const session = new Hyperjump({ stack, allowRetrieval: ["https://a.test/"] });
      const fetching = session.fetch("https://a.test/start");
      await expect(fetching).rejects.toThrow("Fetching 'https://a.test/start' led to 'https://internal.test/secret', which isn't allowed. Add it to the session's 'allowRetrieval' to allow it.");
      await expect(fetching).rejects.toMatchObject({ cause: { code: "ERR_RETRIEVAL_NOT_ALLOWED" } });
      expect(fetched).to.eql(["https://a.test/start"]);
    });

    test("a response from a URL it doesn't allow isn't used, and its body is cancelled", async () => {
      let cancelled = false;
      const stack = fetcher(() => {
        const body = new ReadableStream({ cancel: () => {
          cancelled = true;
        } });
        return withUrl(new Response(body), "https://internal.test/secret");
      });
      const session = new Hyperjump({ stack, allowRetrieval: ["https://a.test/"] });
      await expect(session.fetch("https://a.test/start")).rejects.toThrow("Fetching 'https://a.test/start' led to 'https://internal.test/secret', which isn't allowed");
      expect(cancelled).to.equal(true);
    });

    test("what a layer answers without fetching has to be allowed too", async () => {
      const stack = fetcher(() => new Response("{}"));
      await expect(new Hyperjump({ stack, allowRetrieval: [] }).fetch("https://a.test/a.json")).rejects.toThrow(/isn't allowed/);
      expect(await (await new Hyperjump({ stack, allowRetrieval: ["https://a.test/"] }).fetch("https://a.test/a.json")).text()).to.equal("{}");
    });

    test("a refused URL is recorded as a failure, without the session's headers", async () => {
      let called = false;
      const session = new Hyperjump({
        stack: fetcher(() => new Response("fetched")),
        allowRetrieval: [],
        headers: { "https://a.test/": () => {
          called = true;
          return { "x-api-key": "secret" };
        } }
      });
      /** @type FetchRecord[] */
      const ended = [];
      session.observe((event) => {
        if (event.type === "end") {
          ended.push(event.record);
        }
      });
      await expect(session.fetch("https://a.test/")).rejects.toThrow(/isn't allowed/);
      expect(called, "the headers function isn't called for a refused URL").to.equal(false);
      expect(ended.map((record) => [record.url, record.requestHeaders, record.error instanceof TypeError])).to.eql([["https://a.test/", [], true]]);
    });

    test("an entry that isn't a URL throws when the session is created", () => {
      expect(() => new Hyperjump({ allowRetrieval: ["http://["] })).to.throw(TypeError, /isn't a URL/);
    });
  });
});

/** @type (entries: string[] | TypeError, url: string) => Promise<boolean> */
const allowed = async (entries, url) => {
  if (entries instanceof TypeError) {
    throw entries;
  }
  return allows(await realEntries(entries), url);
};

/** @type (...path: string[]) => string */
const fileUrl = (...path) => pathToFileURL(join(...path)).href;

/** @type (path: string) => string */
const directoryUrl = (path) => pathToFileURL(join(path, "/")).href;
