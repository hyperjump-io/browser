import { describe, test, expect } from "vitest";
import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { defaultTransport } from "../transports/scheme-transport.js";
import { responseMeta } from "../response-meta.js";
import { HttpCache } from "./http-cache.js";
import { FileCacheStore } from "./file-cache-store.js";
import { FileCacheStore as BrowserFileCacheStore } from "./file-cache-store.browser.js";
import { settle, startServer } from "../test-helpers/server.js";
import { testHyperjump } from "../test-helpers/hyperjump.js";

/**
 * @import { CachedEntry } from "./http-cache.d.ts"
 */

/** @type () => Promise<string> */
const directory = () => mkdtemp(join(tmpdir(), "browser-cache-"));

/** @type (url: string, body: string, extra?: Partial<CachedEntry>) => CachedEntry */
const entry = (url, body, extra = {}) => ({
  url,
  status: 200,
  statusText: "OK",
  headers: [["content-type", "text/plain"], ["cache-control", "max-age=60"]],
  body: new TextEncoder().encode(body),
  requestHeaders: [],
  requestTime: 1000,
  responseTime: 1001,
  ...extra
});

/** @type (directory: string) => Promise<string[]> */
const files = async (directory) => {
  /** @type string[] */
  const found = [];
  for (const shard of await readdir(directory).catch(() => /** @type string[] */ ([]))) {
    for (const file of await readdir(join(directory, shard))) {
      found.push(join(directory, shard, file));
    }
  }
  return found;
};

/** @type (lang: string, body: string) => CachedEntry */
const variant = (lang, body) => entry("https://a.test/v", body, {
  headers: [["vary", "accept-language"], ["cache-control", "max-age=60"]],
  requestHeaders: [["accept-language", lang]]
});

describe("the file cache store", () => {
  test("keeps entries for a new store on the same directory, like after a restart", async () => {
    const dir = await directory();
    const original = entry("https://a.test/x", "hello", { status: 203, statusText: "Non-Authoritative" });
    await new FileCacheStore({ directory: dir }).put(original);

    const [loaded] = await new FileCacheStore({ directory: dir }).match("https://a.test/x");
    expect({ ...loaded, body: [...loaded.body] }).to.eql({ ...original, body: [...original.body] });
    expect(await new FileCacheStore({ directory: dir }).match("https://a.test/other")).to.eql([]);
  });

  test("keeps binary bodies byte for byte", async () => {
    const dir = await directory();
    const bytes = new Uint8Array(70_000).map((_, i) => i * 31 % 256);
    await new FileCacheStore({ directory: dir }).put({ ...entry("https://a.test/bin", ""), body: bytes });
    const [loaded] = await new FileCacheStore({ directory: dir }).match("https://a.test/bin");
    expect(loaded.body).to.eql(bytes);
  });

  test("keeps a URL's variants in one file, and a put replaces only its own", async () => {
    const dir = await directory();
    const store = new FileCacheStore({ directory: dir });
    await store.put(variant("en", "hello"));
    await store.put(variant("fr", "bonjour"));
    await store.put(variant("en", "hi"));
    const bodies = (await new FileCacheStore({ directory: dir }).match("https://a.test/v")).map((stored) => new TextDecoder().decode(stored.body));
    expect(bodies.toSorted()).to.eql(["bonjour", "hi"]);
    expect((await files(dir)).length).to.equal(1);
  });

  test("puts to one URL at the same time don't lose variants", async () => {
    const dir = await directory();
    const store = new FileCacheStore({ directory: dir });
    await Promise.all(["en", "fr", "de", "es", "it"].map((lang) => store.put(variant(lang, lang))));
    expect((await store.match("https://a.test/v")).length).to.equal(5);
    expect((await files(dir)).every((file) => !file.endsWith(".tmp")), "no temporary files are left").to.equal(true);
  });

  test("deletes a URL, and clears everything", async () => {
    const store = new FileCacheStore({ directory: await directory() });
    await store.put(entry("https://a.test/1", "1"));
    await store.put(entry("https://a.test/2", "2"));
    await store.delete("https://a.test/1");
    expect(await store.match("https://a.test/1")).to.eql([]);
    expect((await store.match("https://a.test/2")).length).to.equal(1);
    await store.clear();
    expect(await store.match("https://a.test/2")).to.eql([]);
    expect(await store.size()).to.equal(0);
  });

  test("a damaged file is a miss, and is removed", async () => {
    const dir = await directory();
    await new FileCacheStore({ directory: dir }).put(entry("https://a.test/x", "hello"));
    const [path] = await files(dir);
    const data = await readFile(path);
    await writeFile(path, data.subarray(0, data.byteLength - 3));

    expect(await new FileCacheStore({ directory: dir }).match("https://a.test/x")).to.eql([]);
    expect(await files(dir)).to.eql([]);
  });

  test("temporary files left by a crash are removed", async () => {
    const dir = await directory();
    await new FileCacheStore({ directory: dir }).put(entry("https://a.test/x", "x"));
    const [path] = await files(dir);
    await writeFile(`${path}.abc123.tmp`, "half-written");
    await new FileCacheStore({ directory: dir }).size();
    expect(await files(dir)).to.eql([path]);
  });

  test("removes the least recently used URLs past maxSize", async () => {
    const probe = new FileCacheStore({ directory: await directory() });
    const body = "x".repeat(1000);
    await probe.put(entry("https://a.test/1", body));
    const one = await probe.size();

    const store = new FileCacheStore({ directory: await directory(), maxSize: one * 3 + 10 });
    const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
    await store.put(entry("https://a.test/1", body));
    await pause();
    await store.put(entry("https://a.test/2", body));
    await pause();
    await store.put(entry("https://a.test/3", body));
    await pause();
    await store.match("https://a.test/1");
    await pause();
    await store.put(entry("https://a.test/4", body));

    /** @type number[] */
    const present = [];
    for (const n of [1, 2, 3, 4]) {
      if ((await store.match(`https://a.test/${n}`)).length) {
        present.push(n);
      }
    }
    expect(present, "2 was the least recently used").to.eql([1, 3, 4]);
    expect(await store.size()).to.be.lessThanOrEqual(store.maxSize);
  });

  test.skipIf(process.platform === "win32")("its files and the directories made for them are only the user's", async () => {
    const root = join(await directory(), "cache");
    const store = new FileCacheStore({ directory: root });
    await store.put(entry("https://a.test/", "private"));

    const [file] = await files(root);
    expect((await stat(file)).mode & 0o777).to.equal(0o600);
    expect((await stat(dirname(file))).mode & 0o777).to.equal(0o700);
    expect((await stat(root)).mode & 0o777).to.equal(0o700);
  });

  test("names files by a hash of the URL, so a URL is never a path", async () => {
    const dir = await directory();
    await new FileCacheStore({ directory: dir }).put(entry("https://a.test/../../etc/passwd?x=1", "x"));
    const [path] = await files(dir);
    expect(path.slice(dir.length)).to.match(/^\/[0-9a-f]{2}\/[0-9a-f]{62}$/);
  });

  test("the HTTP cache keeps working after a restart", async () => {
    const dir = await directory();
    const server = await startServer((_request, response) => {
      response.setHeader("cache-control", "max-age=600");
      response.end("kept");
    });
    try {
      const run = async () => {
        const session = testHyperjump(new HttpCache(defaultTransport(), { store: new FileCacheStore({ directory: dir }) }), { allow: [server.url] });
        const response = await session.fetch(`${server.url}/doc`);
        const body = await response.text();
        await settle();
        return { body, cache: responseMeta(response).cache };
      };
      expect(await run()).to.eql({ body: "kept", cache: "miss" });
      expect(await run(), "a new process found it on disk").to.eql({ body: "kept", cache: "hit" });
      expect(server.hits.get("/doc")).to.equal(1);
    } finally {
      await server.close();
    }
  });

  test("throws in a browser", () => {
    expect(() => new BrowserFileCacheStore({ directory: "x" })).toThrow(/isn't supported in this environment/);
  });
});
