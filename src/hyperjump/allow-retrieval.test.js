import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { describe, test, beforeAll, afterAll, expect } from "vitest";
import { FileNotFoundError, HttpError, Hyperjump, RetrievalError } from "./index.js";
import { AllowedUrls, configSource, resolveAllowRetrieval } from "./allowed-urls.js";
import { contextUrl } from "#context-url";
import { toJson } from "../json/jsonast-util.js";

/**
 * @import { HyperjumpConfig, UrlSchemePlugin } from "./index.js"
 */

const document = `{ "foo": 42 }`;

describe("allowRetrieval", () => {
  /** A directory in the working directory, which the default allows */
  let inside = "";

  /** A directory outside the working directory, which the default refuses */
  let outside = "";

  beforeAll(async () => {
    inside = await mkdtemp(join(cwd(), ".allow-retrieval-test-"));
    outside = await mkdtemp(join(tmpdir(), "hyperjump-"));
    await writeFile(join(inside, "inside.json"), document);
    await writeFile(join(outside, "outside.json"), document);
    await symlink(join(outside, "outside.json"), join(inside, "link.json"));
    await symlink(outside, join(inside, "linked-directory"));
    await writeFile(join(inside, "refers-outside.jref"), JSON.stringify({
      $ref: fileUrl(join(outside, "outside.json"))
    }));
  });

  afterAll(async () => {
    await rm(inside, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  describe("the default in Node.js", () => {
    test("a file in the working directory is allowed", async () => {
      const node = await defaultSession().get(fileUrl(join(inside, "inside.json")));
      expect(toJson(node)).to.equal(`{"foo":42}`);
    });

    test("a file outside the working directory is refused", async () => {
      const url = fileUrl(join(outside, "outside.json"));
      const error = await refusal(defaultSession().get(url));
      expect(error.response.url).to.equal(url);
    });

    test("a symlink to a file outside the working directory is refused", async () => {
      const url = fileUrl(join(inside, "link.json"));
      await refusal(defaultSession().get(url));
    });

    test("a file in a symlinked directory that's outside the working directory is refused", async () => {
      const url = fileUrl(join(inside, "linked-directory", "outside.json"));
      await refusal(defaultSession().get(url));
    });

    test("a missing file in the working directory is missing, not refused", async () => {
      const url = fileUrl(join(inside, "missing.json"));
      const error = await defaultSession().get(url)
        .catch((/** @type unknown */ error) => error);
      expect(error).to.be.instanceOf(RetrievalError);
      expect(/** @type Error */ (error).cause).to.be.instanceOf(FileNotFoundError);
    });

    test("a reference to a file outside the working directory is refused", async () => {
      const url = fileUrl(join(inside, "refers-outside.jref"));
      const session = defaultSession();
      await refusal(session.get(url));
    });

    test("a file on another host is refused", async () => {
      const url = "file://example.com/share/document.json";
      const error = await refusal(defaultSession().get(url));
      expect(error.response.url).to.equal(url);
    });

    test("http(s): is refused", async () => {
      const session = defaultSession();
      await refusal(session.get("https://example.com/document"));
      await refusal(session.get("http://localhost/document"));
    });
  });

  describe("a list", () => {
    test("it replaces the default", async () => {
      const session = hyperjumpWith({ allowRetrieval: [directoryUri(outside)] }).session();
      const node = await session.get(fileUrl(join(outside, "outside.json")));
      expect(toJson(node)).to.equal(`{"foo":42}`);
      await refusal(session.get(fileUrl(join(inside, "inside.json"))));
    });

    test("an entry that ends with '/' allows what's under it", async () => {
      await mkdir(join(inside, "deep"), { recursive: true });
      await writeFile(join(inside, "deep", "under.json"), document);
      await mkdir(join(inside, "deeper"), { recursive: true });
      await writeFile(join(inside, "deeper", "sibling.json"), document);

      const session = hyperjumpWith({ allowRetrieval: [directoryUri(join(inside, "deep"))] }).session();
      const node = await session.get(fileUrl(join(inside, "deep", "under.json")));
      expect(toJson(node)).to.equal(`{"foo":42}`);
      await refusal(session.get(fileUrl(join(inside, "deeper", "sibling.json"))));
    });

    test("any other entry allows only itself", async () => {
      const session = hyperjumpWith({ allowRetrieval: [fileUrl(join(inside, "inside.json"))] }).session();
      const node = await session.get(fileUrl(join(inside, "inside.json")));
      expect(toJson(node)).to.equal(`{"foo":42}`);
      await refusal(session.get(fileUrl(join(inside, "inside.json.bak"))));
    });

    test("an origin without a '/' allows everything on it", async () => {
      const allowed = new AllowedUrls(resolveAllowRetrieval(["https://example.com"], undefined, configSource), undefined);
      expect(await allowed.allows("https://example.com/foo/bar")).to.equal(true);
      expect(await allowed.allows("https://other.example.com/foo")).to.equal(false);
    });

    test("a relative entry is resolved against the working directory", async () => {
      const session = hyperjumpWith({ allowRetrieval: [`./${relative(cwd(), inside)}/`] }).session();
      const node = await session.get(fileUrl(join(inside, "inside.json")));
      expect(toJson(node)).to.equal(`{"foo":42}`);
    });

    test("a file: entry is compared by its real path", async () => {
      const session = hyperjumpWith({ allowRetrieval: [directoryUri(join(inside, "linked-directory"))] }).session();
      const node = await session.get(fileUrl(join(outside, "outside.json")));
      expect(toJson(node)).to.equal(`{"foo":42}`);
    });

    test("a file: entry with a host is compared as it is", async () => {
      const allowed = new AllowedUrls(resolveAllowRetrieval(["file://example.com/share/"], undefined, configSource), undefined);
      expect(await allowed.allows("file://example.com/share/document.json")).to.equal(true);
      expect(await allowed.allows("file://example.com/other/document.json")).to.equal(false);
    });

    test("an entry's fragment is ignored", async () => {
      const hyperjump = hyperjumpWith({ allowRetrieval: ["test:/document#foo"], urlSchemePlugins: [testScheme()] });
      const node = await hyperjump.session().get("test:/document");
      expect(toJson(node)).to.equal(`{"foo":42}`);
    });

    test("an empty list allows nothing", async () => {
      const session = hyperjumpWith({ allowRetrieval: [] }).session();
      await refusal(session.get(fileUrl(join(inside, "inside.json"))));
    });

    test("an entry that isn't a URL throws when it's configured", () => {
      expect(() => hyperjumpWith({ allowRetrieval: ["http://[example"] })).to.throw(TypeError, "'http://[example' in the 'allowRetrieval' config isn't a URL");
    });

    test("changing the list it was configured with doesn't change it", async () => {
      const allowRetrieval = /** @type string[] */ ([]);
      const config = { allowRetrieval };
      const hyperjump = hyperjumpWith(config);
      allowRetrieval.push(directoryUri(inside));
      config.allowRetrieval = [directoryUri(inside)];

      await refusal(hyperjump.session().get(fileUrl(join(inside, "inside.json"))));
    });

    test("the config's list can't be changed", () => {
      const hyperjump = hyperjumpWith({ allowRetrieval: [] });

      expect(Object.isFrozen(hyperjump.config)).to.equal(true);
      expect(() => hyperjump.config.allowRetrieval?.push(directoryUri(inside))).to.throw(TypeError);
    });

    test("a response from a refused URL isn't used", async () => {
      const hyperjump = hyperjumpWith({ allowRetrieval: ["test:/"], urlSchemePlugins: [testScheme("https://internal.example.com/document")] });

      const error = await refusal(hyperjump.session().get("test:/document"));
      expect(error.response.url).to.equal("https://internal.example.com/document");
      expect(error.message).to.equal("403 Forbidden -- Retrieving 'test:/document' led to 'https://internal.example.com/document', which isn't allowed. Use the 'allowRetrieval' config to allow it.");
    });
  });

  describe("a session's list", () => {
    test("it's used instead of the config's", async () => {
      const session = hyperjumpWith({ allowRetrieval: [] }).session({ allowRetrieval: [directoryUri(outside)] });
      const node = await session.get(fileUrl(join(outside, "outside.json")));
      expect(toJson(node)).to.equal(`{"foo":42}`);
    });

    test("it can refuse what the config allows", async () => {
      const session = hyperjumpWith({ allowRetrieval: [directoryUri(inside)] }).session({ allowRetrieval: [] });
      await refusal(session.get(fileUrl(join(inside, "inside.json"))));
    });

    test("other sessions use the config's", async () => {
      const hyperjump = hyperjumpWith({ allowRetrieval: [] });
      hyperjump.session({ allowRetrieval: [directoryUri(inside)] });
      await refusal(hyperjump.session().get(fileUrl(join(inside, "inside.json"))));
    });

    test("references use it", async () => {
      const session = hyperjumpWith({ allowRetrieval: [] }).session({ allowRetrieval: ["./", directoryUri(outside)] });
      const node = await session.get(fileUrl(join(inside, "refers-outside.jref")));
      expect(toJson(node)).to.equal(`{"foo":42}`);
    });

    test("it checks where a response came from", async () => {
      const hyperjump = hyperjumpWith({ allowRetrieval: ["test:/", "https://internal.example.com/"], urlSchemePlugins: [testScheme("https://internal.example.com/document")] });

      const session = hyperjump.session({ allowRetrieval: ["test:/"] });
      const error = await refusal(session.get("test:/document"));
      expect(error.message).to.contain("'test:/document' led to 'https://internal.example.com/document', which isn't allowed. Use the session's 'allowRetrieval' option to allow it.");
    });

    test("a URL it refuses says to change it, not the config", async () => {
      const session = hyperjumpWith({ allowRetrieval: [directoryUri(inside)] }).session({ allowRetrieval: [] });
      const error = await refusal(session.get(fileUrl(join(inside, "inside.json"))));
      expect(error.message).to.contain("isn't allowed. Use the session's 'allowRetrieval' option to allow it.");
    });

    test("an entry that isn't a URL throws when the session is created", () => {
      expect(() => hyperjumpWith().session({ allowRetrieval: ["http://[example"] })).to.throw(TypeError, "'http://[example' in the session's 'allowRetrieval' option isn't a URL");
    });
  });

  describe("against a page, or nothing", () => {
    test("the default is the page's directory", async () => {
      const allowed = new AllowedUrls(undefined, "https://example.com/app/index.html");
      expect(await allowed.allows("https://example.com/app/document")).to.equal(true);
      expect(await allowed.allows("https://example.com/document")).to.equal(false);
      expect(await allowed.allows("https://other.example.com/app/document")).to.equal(false);
    });

    test("a relative entry without a page throws", () => {
      expect(() => resolveAllowRetrieval(["./documents/"], undefined, configSource)).to.throw(TypeError, "'./documents/' in the 'allowRetrieval' config is relative");
    });

    test("an absolute entry without a page is fine", () => {
      expect(resolveAllowRetrieval(["https://example.com/documents/"], undefined, configSource)).to.eql(["https://example.com/documents/"]);
    });

    test("the default without a page throws when it's checked, not before", async () => {
      const allowed = new AllowedUrls(undefined, undefined);
      await expect(allowed.allows("https://example.com/document")).rejects.toBeInstanceOf(TypeError);
      await expect(allowed.allows("https://example.com/document")).rejects.toThrow("The default 'allowRetrieval' is './', which is relative, and there's nothing to resolve it against here. Use the 'allowRetrieval' config with absolute URLs.");
    });
  });
});

describe("the working directory's entry", () => {
  /** @type AllowedUrls */
  let allowed;

  beforeAll(() => {
    allowed = new AllowedUrls(resolveAllowRetrieval(["./"], contextUrl(), configSource), contextUrl());
  });

  test("a sibling directory whose name starts with the working directory's isn't in it", async () => {
    const sibling = `${await realpath(cwd())}-other`;
    expect(await allowed.allows(fileUrl(join(sibling, "a.json")))).to.equal(false);
  });

  test("a file whose name starts with '..' is in it", async () => {
    expect(await allowed.allows(fileUrl(join(await realpath(cwd()), "..a.json")))).to.equal(true);
  });

  test("the parent directory isn't in it", async () => {
    expect(await allowed.allows(fileUrl(join(await realpath(cwd()), "..", "a.json")))).to.equal(false);
  });
});

/** @type (path: string) => string */
const fileUrl = (path) => pathToFileURL(path).href;

/** @type (path: string) => string */
const directoryUri = (path) => pathToFileURL(join(path, "/")).href;

/**
 * A plugin for `test:` URLs whose response claims to come from `url`
 *
 * @type (url?: string) => UrlSchemePlugin
 */
const testScheme = (url) => ({
  schemes: ["test"],
  retrieve: async (requested) => {
    const response = new Response(document, { headers: { "Content-Type": "application/json" } });
    Object.defineProperty(response, "url", { value: url ?? requested });
    return response;
  }
});

/** @type (config?: HyperjumpConfig) => Hyperjump */
const hyperjumpWith = (config) => new Hyperjump(config);

const defaultSession = () => new Hyperjump().session();

/**
 * The `HttpError` for a refusal by `allowRetrieval`, which is the cause of
 * the `RetrievalError` a session gives
 *
 * @type (retrieval: Promise<unknown>) => Promise<HttpError>
 */
const refusal = async (retrieval) => {
  const error = await retrieval.then(() => {
    throw Error("Expected a refusal");
  }, (/** @type unknown */ error) => error);
  expect(error).to.be.instanceOf(RetrievalError);
  const cause = /** @type Error */ (error).cause;
  expect(cause).to.be.instanceOf(HttpError);
  expect(/** @type HttpError */ (cause).response.status).to.equal(403);
  return /** @type HttpError */ (cause);
};
