import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, test, expect } from "vitest";
import { build } from "vite";
import { contextUri } from "./hyperjump/context-uri.browser.js";
import { defaultHttpCache } from "./hyperjump/uri-schemes/default-http-cache.browser.js";
import { defaultUriSchemePlugins } from "./hyperjump/uri-schemes/default-uri-scheme-plugins.browser.js";
import { FileUriSchemePlugin } from "./hyperjump/uri-schemes/file-scheme-plugin.browser.js";
import { pathToUri as browserPathToUri } from "./jref/path-to-uri.browser.js";
import { pathToUri } from "./jref/path-to-uri.js";

/**
 * @typedef {{
 *   exports: Record<string, { types: string; default: string }>;
 * }} Package
 */

const packageJsonUrl = new URL("../package.json", import.meta.url);

/** @type Package */
const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));

describe("Browser compatibility", () => {
  for (const [subpath, { default: entryPoint }] of Object.entries(packageJson.exports)) {
    test(`'${subpath}' can be bundled for the browser`, async () => {
      /** @type string[] */
      const nodeImports = [];

      await build({
        configFile: false,
        logLevel: "silent",
        build: {
          write: false,
          lib: {
            entry: fileURLToPath(new URL(entryPoint, packageJsonUrl)),
            formats: ["es"]
          }
        },
        plugins: [{
          // Vite replaces Node.js built-ins with an empty module in browser
          // builds instead of failing, so record them before it gets the chance.
          name: "detect-node-imports",
          enforce: "pre",
          resolveId(id, importer) {
            if (isBuiltin(id)) {
              nodeImports.push(`${id} <- ${importer}`);
            }
          }
        }]
      });

      expect(nodeImports).to.eql([]);
    });
  }

  describe("browser variants", () => {
    test.each([
      ["https://example.com/foo/bar.html", "https://example.com/foo/bar.html"],
      ["https://example.com/foo/bar.html#top", "https://example.com/foo/bar.html"],
      ["https://example.com/a|b/", "https://example.com/a%7Cb/"]
    ])("contextUri of a document at %s is %s", (href, expected) => {
      Object.defineProperty(globalThis, "document", { value: { location: { href } }, configurable: true });
      try {
        expect(contextUri()).to.equal(expected);
      } finally {
        Reflect.deleteProperty(globalThis, "document");
      }
    });

    test("there's no contextUri without a document", () => {
      expect(contextUri()).to.equal(undefined);
    });

    test("the file: scheme isn't a default URI scheme", () => {
      const schemes = defaultUriSchemePlugins().flatMap((plugin) => plugin.schemes);
      expect(schemes).to.eql(["http", "https"]);
    });

    test("there's no default HTTP cache", () => {
      expect(defaultHttpCache()).to.equal(undefined);
    });

    test("FileUriSchemePlugin can't be constructed", () => {
      expect(() => new FileUriSchemePlugin()).to.throw();
    });

    describe("pathToUri matches the Node.js implementation", () => {
      /** @type [string, string][] */
      const cases = [
        ["/", "foo.jref"],
        ["/foo", "bar/baz.jref"],
        ["/foo/", "bar.jref"],
        ["/foo", "/absolute/bar.jref"],
        ["/foo", "../bar.jref"],
        ["/foo", "with space.jref"],
        ["/foo", "hash#and?query.jref"],
        ["/foo", "percent%25.jref"],
        ["/foo", "unicodé.jref"],
        ["/foo", "back\\slash.jref"],
        ["/foo", "pipe|and^caret.jref"],
        ["/foo", "[brackets].jref"],
        ["/a|b", "bar.jref"],
        ["/foo", "tab\tand\nnewline.jref"],
        ["/with space", "bar.jref"]
      ];

      for (const [cwd, path] of cases) {
        test(`cwd: '${cwd}', path: '${path}'`, () => {
          expect(browserPathToUri(cwd, path)).to.equal(pathToUri(cwd, path));
        });
      }
    });
  });
});
