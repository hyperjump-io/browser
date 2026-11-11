import { describe, test, expect } from "vitest";
import { canRefer } from "./file-references.js";
import { fetcher } from "./layers.js";
import { ResourceMap } from "./layers/resource-map.js";
import { withUrl } from "./response-meta.js";
import { testSession } from "./test-helpers/session.js";

/**
 * @import { FetchRecord } from "./fetch-record.d.ts"
 * @import { Decorator, Fetcher } from "./layers.d.ts"
 * @import { Session } from "./session.js"
 * @import { SessionOptions } from "./session.d.ts"
 */

describe("file: references", () => {
  test("only a file: document can refer to a file: URL", () => {
    expect(canRefer("file:///project/a.json", "file:///project/b.json")).to.equal(true);
    expect(canRefer("file:///project/a.json", "https://a.test/b.json")).to.equal(false);
    expect(canRefer("file:///project/a.json", "data:application/json,{}")).to.equal(false);
    expect(canRefer("https://a.test/a.json", "https://a.test/b.json")).to.equal(true);
    expect(canRefer("https://a.test/a.json", "file:///project/b.json")).to.equal(true);
  });

  test("a request without a referrer is the application's, and can fetch a file: URL", () => {
    expect(canRefer("file:///project/a.json", undefined)).to.equal(true);
  });

  describe("in a session", () => {
    test("a document from the web can't refer to a file, even one allowRetrieval allows", async () => {
      const { session, fetched } = setup();
      const page = await session.fetch("https://a.test/page.json");
      await expect(session.fetch("file:///project/a.json", { initiator: page })).rejects.toThrow("Fetching 'file:///project/a.json' isn't allowed from 'https://a.test/page.json'. Only a file: document can refer to a file: URL.");
      expect(fetched()).to.eql(["https://a.test/page.json"]);
    });

    test("a file: document can refer to a file, and the application can fetch one", async () => {
      const { session } = setup();
      const document = await session.fetch("file:///project/a.json");
      expect(await (await session.fetch("file:///project/b.json", { initiator: document })).text()).to.equal("from file:///project/b.json");
    });

    test("the referrer is where the initiator's response came from, after redirects", async () => {
      const session = testSession(fetcher((request) => request.url === "https://a.test/start"
        ? new Response(null, { status: 302, headers: { location: "https://b.test/page.json" } })
        : new Response(`from ${request.url}`)), { allow: ["file:///project/"] });
      const page = await session.fetch("https://a.test/start");
      await expect(session.fetch("file:///project/a.json", { initiator: page })).rejects.toThrow(/isn't allowed from 'https:\/\/b.test\/page.json'/);
    });

    test("a refused reference is recorded, without the session's headers", async () => {
      let called = false;
      const { session } = setup({ headers: { "file:///project/": () => {
        called = true;
        return { "x-api-key": "secret" };
      } } });
      const page = await session.fetch("https://a.test/page.json");
      /** @type FetchRecord[] */
      const ended = [];
      session.observe((event) => {
        if (event.type === "end") {
          ended.push(event.record);
        }
      });
      await expect(session.fetch("file:///project/a.json", { initiator: page })).rejects.toThrow(/Only a file: document/);
      expect(called).to.equal(false);
      expect(ended.map((record) => [record.url, record.requestHeaders, record.error instanceof TypeError])).to.eql([["file:///project/a.json", [], true]]);
    });

    test("a redirect can't lead a document from the web to a file", async () => {
      /** @type string[] */
      const fetched = [];
      const session = testSession(fetcher((request) => {
        fetched.push(request.url);
        return request.url.startsWith("file:")
          ? new Response(`from ${request.url}`)
          : new Response(null, { status: 302, headers: { location: "file:///project/a.json" } });
      }), { allow: ["file:///project/"], redirectSchemes: ["http:", "https:", "file:"] });
      const page = await session.fetch("file:///project/page.json");
      const web = await session.fetch("https://a.test/page.json", { redirect: "manual" });
      fetched.length = 0;

      await expect(session.fetch("https://a.test/start", { initiator: web })).rejects.toThrow("Fetching 'https://a.test/start' led to 'file:///project/a.json', which isn't allowed from 'https://a.test/page.json'. Only a file: document can refer to a file: URL.");
      expect(fetched).to.eql(["https://a.test/start"]);

      expect(await (await session.fetch("https://a.test/start", { initiator: page })).text(), "from a file").to.equal("from file:///project/a.json");
      expect(await (await session.fetch("https://a.test/start")).text(), "from the application").to.equal("from file:///project/a.json");
    });

    test("a response from a file isn't used for a document from the web, and its body is cancelled", async () => {
      let cancelled = false;
      const session = testSession(fetcher((request) => {
        if (request.url.startsWith("https:")) {
          return new Response("{}");
        }
        const body = new ReadableStream({ cancel: () => {
          cancelled = true;
        } });
        return withUrl(new Response(body), "file:///project/a.json");
      }), { allow: ["file:///project/", "urn:example:a"] });
      const page = await session.fetch("https://a.test/page.json");
      await expect(session.fetch("urn:example:a", { initiator: page })).rejects.toThrow("Fetching 'urn:example:a' led to 'file:///project/a.json', which isn't allowed from 'https://a.test/page.json'");
      expect(cancelled).to.equal(true);
    });

    test("a document from the web can't contain a file", async () => {
      /** @type ResourceMap | undefined */
      let map;
      const { session, fetched } = setup({ layer: (inner) => map = new ResourceMap(inner) });
      const bundle = await session.fetch("https://a.test/bundle.json");
      map?.register(bundle, "file:///project/a.json", "the bundle's");
      await expect(session.fetch("file:///project/a.json", { initiator: bundle })).rejects.toThrow(/Only a file: document/);
      expect(fetched()).to.eql(["https://a.test/bundle.json"]);
    });
  });
});

/**
 * A session whose stack answers every URL with where it's from, under
 * `layer`, and can fetch the test origins and the files in `file:///project/`
 *
 * @type (options?: SessionOptions & { layer?: Decorator }) => { session: Session, fetched: () => string[] }
 */
const setup = ({ layer = (/** @type Fetcher */ inner) => inner, ...options } = {}) => {
  /** @type string[] */
  const fetched = [];
  const stack = layer(fetcher((request) => {
    fetched.push(request.url);
    return new Response(`from ${request.url}`);
  }));
  return { session: testSession(stack, { allow: ["file:///project/"], ...options }), fetched: () => fetched };
};
