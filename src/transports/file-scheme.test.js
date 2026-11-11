import { describe, test, expect, beforeAll } from "vitest";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { responseMeta } from "../response-meta.js";
import { nodeTransport } from "./node-transport.js";
import { fileScheme as browserFileScheme } from "./file-scheme.browser.js";
import { nodeTransport as browserNodeTransport } from "./node-transport.browser.js";
import { testSession } from "../test-helpers/session.js";

/**
 * @import { Session } from "../session.d.ts"
 */

describe("the file: scheme", () => {
  /** @type string */
  let directory;
  /** @type Session */
  let session;
  /** @type (path: string) => URL */
  let site;

  beforeAll(async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), "browser-file-")));
    await mkdir(join(directory, "site"));
    await writeFile(join(directory, "site", "index.html"), "<h1>hi</h1>");
    await writeFile(join(directory, "site", "data.ts"), "export {}");
    await writeFile(join(directory, "secret.txt"), "nope");
    await symlink(join(directory, "secret.txt"), join(directory, "site", "escape.txt"));
    await symlink(join(directory, "site", "index.html"), join(directory, "site", "alias.html"));
    const siteUrl = pathToFileURL(join(directory, "site") + "/");
    site = (path) => new URL(path, siteUrl);
    session = testSession(nodeTransport({ file: { root: join(directory, "site"), contentTypes: { ts: "text/typescript" } } }), {
      // What `root` refuses, so these tests are about `root`
      allow: [pathToFileURL(directory + "/").href]
    });
  });

  test("a file's response has its content type, length, and URL", async () => {
    const response = await session.fetch(site("index.html"));
    expect(response.status).to.equal(200);
    expect(response.headers.get("content-type")).to.equal("text/html; charset=utf-8");
    expect(response.headers.get("content-length")).to.equal("11");
    expect(response.headers.get("last-modified")).to.be.a("string");
    expect(response.url).to.equal(pathToFileURL(join(directory, "site", "index.html")).href);
    expect(responseMeta(response).source).to.equal("file");
    expect(await response.text()).to.equal("<h1>hi</h1>");
  });

  test("more content types can be given", async () => {
    const response = await session.fetch(site("data.ts"));
    expect(response.headers.get("content-type")).to.equal("text/typescript");
    await response.body?.cancel();
  });

  test("HEAD has no body", async () => {
    expect((await session.fetch(site("index.html"), { method: "HEAD" })).body).to.equal(null);
  });

  test("a missing file is a network error, not a 404", async () => {
    await expect(session.fetch(site("missing.html"))).rejects.toThrow(TypeError);
  });

  test("a directory is a network error", async () => {
    await expect(testSession(nodeTransport(), { allow: [pathToFileURL(directory).href] }).fetch(pathToFileURL(directory).href)).rejects.toThrow(/isn't a file/);
  });

  test("a file outside the root is a network error", async () => {
    await expect(session.fetch(site("../secret.txt"))).rejects.toThrow(/outside the allowed root/);
  });

  test("a symlink in the root that points outside it is a network error", async () => {
    await expect(session.fetch(site("escape.txt"))).rejects.toThrow(/outside the allowed root/);
  });

  test("a symlink's response has the URL of the file it points to", async () => {
    const response = await session.fetch(site("alias.html?x=1"));
    expect(response.url).to.equal(pathToFileURL(join(directory, "site", "index.html")).href + "?x=1");
    expect(await response.text()).to.equal("<h1>hi</h1>");
  });

  test("a method other than GET or HEAD is a network error", async () => {
    await expect(session.fetch(site("index.html"), { method: "POST", body: "x" })).rejects.toThrow(TypeError);
  });

  test("the Node.js transport can leave file: out", async () => {
    await expect(testSession(nodeTransport({ file: false }), { allow: [pathToFileURL(directory + "/").href] }).fetch(pathToFileURL(join(directory, "secret.txt")))).rejects.toThrow(/isn't supported/);
  });

  test("in a browser, file: and the Node.js transport throw", () => {
    expect(() => browserFileScheme()).toThrow(/isn't supported in this environment/);
    expect(() => browserNodeTransport()).toThrow(/isn't supported in this environment/);
  });
});
