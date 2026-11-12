import { describe, test, expect, beforeAll } from "vitest";
import { chmod, mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
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
    await writeFile(join(directory, "secret.txt"), "nope");
    await writeFile(join(directory, "site", "unreadable.txt"), "nope");
    await chmod(join(directory, "site", "unreadable.txt"), 0o000);
    await symlink(join(directory, "secret.txt"), join(directory, "site", "escape.txt"));
    await symlink(join(directory, "site", "index.html"), join(directory, "site", "alias.html"));
    const siteUrl = pathToFileURL(join(directory, "site") + "/");
    site = (path) => new URL(path, siteUrl);
    session = testSession(nodeTransport({ file: { root: join(directory, "site") } }), {
      // What `root` refuses, so these tests are about `root`
      allow: [pathToFileURL(directory + "/").href]
    });
  });

  test("a file's response has its length and URL, and no content type", async () => {
    const response = await session.fetch(site("index.html"));
    expect(response.status).to.equal(200);
    expect(response.headers.get("content-type")).to.equal(null);
    expect(response.headers.get("content-length")).to.equal("11");
    expect(response.headers.get("last-modified")).to.be.a("string");
    expect(response.url).to.equal(pathToFileURL(join(directory, "site", "index.html")).href);
    expect(responseMeta(response).source).to.equal("file");
    expect(await response.text()).to.equal("<h1>hi</h1>");
  });

  test("HEAD has no body", async () => {
    expect((await session.fetch(site("index.html"), { method: "HEAD" })).body).to.equal(null);
  });

  test("a missing file is a network error, not a 404, whose cause is the filesystem's", async () => {
    const fetching = session.fetch(site("missing.html"));
    await expect(fetching).rejects.toThrow(TypeError);
    await expect(fetching).rejects.toThrow(`'${site("missing.html").href}' doesn't exist`);
    await expect(fetching).rejects.toMatchObject({ cause: { code: "ENOENT" } });
  });

  // Permissions don't stop root
  test.skipIf(process.getuid?.() === 0)("a file that can't be read fails before its body", async () => {
    const fetching = session.fetch(site("unreadable.txt"));
    await expect(fetching).rejects.toThrow(/can't be read, because permission is denied/);
    await expect(fetching).rejects.toMatchObject({ cause: { code: "EACCES" } });
  });

  test("a directory is a network error", async () => {
    const fetching = testSession(nodeTransport(), { allow: [pathToFileURL(directory).href] }).fetch(pathToFileURL(directory).href);
    await expect(fetching).rejects.toThrow(/is a directory/);
    await expect(fetching).rejects.toMatchObject({ cause: { code: "ERR_NOT_A_FILE" } });
  });

  test("a file outside the root is a network error", async () => {
    const fetching = session.fetch(site("../secret.txt"));
    await expect(fetching).rejects.toThrow(`is outside the file: scheme's root, '${join(directory, "site")}'`);
    await expect(fetching).rejects.toMatchObject({ cause: { code: "ERR_OUTSIDE_ROOT" } });
  });

  test("a symlink in the root that points outside it is a network error", async () => {
    await expect(session.fetch(site("escape.txt"))).rejects.toMatchObject({ cause: { code: "ERR_OUTSIDE_ROOT" } });
  });

  test("a root that can't be read is a network error that names it", async () => {
    const missingRoot = testSession(nodeTransport({ file: { root: join(directory, "missing") } }), { allow: [pathToFileURL(directory + "/").href] });
    const fetching = missingRoot.fetch(pathToFileURL(join(directory, "missing", "a.json")));
    await expect(fetching).rejects.toThrow(/The file: scheme's root, '.*missing', can't be read/);
    await expect(fetching).rejects.toMatchObject({ cause: { code: "ENOENT" } });
  });

  test("a symlink's response has the URL of the file it points to", async () => {
    const response = await session.fetch(site("alias.html?x=1"));
    expect(response.url).to.equal(pathToFileURL(join(directory, "site", "index.html")).href + "?x=1");
    expect(await response.text()).to.equal("<h1>hi</h1>");
  });

  test("a method other than GET or HEAD is a network error", async () => {
    await expect(session.fetch(site("index.html"), { method: "POST", body: "x" })).rejects.toMatchObject({ cause: { code: "ERR_METHOD_NOT_SUPPORTED" } });
  });

  test("the Node.js transport can leave file: out", async () => {
    await expect(testSession(nodeTransport({ file: false }), { allow: [pathToFileURL(directory + "/").href] }).fetch(pathToFileURL(join(directory, "secret.txt")))).rejects.toMatchObject({ cause: { code: "ERR_UNKNOWN_URL_SCHEME" } });
  });

  test("in a browser, file: and the Node.js transport throw", () => {
    expect(() => browserFileScheme()).toThrow(/isn't supported in this environment/);
    expect(() => browserNodeTransport()).toThrow(/isn't supported in this environment/);
  });
});
