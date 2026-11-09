import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, test, expect } from "vitest";
import { build } from "vite";
import { contextUrl } from "./hyperjump/context-url.browser.js";
import { defaultHttpCache } from "./hyperjump/url-schemes/default-http-cache.browser.js";
import { defaultUrlSchemePlugins } from "./hyperjump/url-schemes/default-url-scheme-plugins.browser.js";
import { FileUrlSchemePlugin } from "./hyperjump/url-schemes/file-scheme-plugin.browser.js";
import { pathToUrl as browserPathToUrl } from "./json/path-to-url.browser.js";
import { pathToUrl } from "./json/path-to-url.js";

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
      ["https://example.com/a|b/", "https://example.com/a|b/"]
    ])("contextUrl of a document at %s is %s", (href, expected) => {
      Object.defineProperty(globalThis, "document", { value: { location: { href } }, configurable: true });
      try {
        expect(contextUrl()).to.equal(expected);
      } finally {
        Reflect.deleteProperty(globalThis, "document");
      }
    });

    test("there's no contextUrl without a document", () => {
      expect(contextUrl()).to.equal(undefined);
    });

    test("the file: scheme isn't a default URL scheme", () => {
      const schemes = defaultUrlSchemePlugins().flatMap((plugin) => plugin.schemes);
      expect(schemes).to.eql(["http", "https"]);
    });

    test("there's no default HTTP cache", () => {
      expect(defaultHttpCache()).to.equal(undefined);
    });

    test("FileUrlSchemePlugin can't be constructed", () => {
      expect(() => new FileUrlSchemePlugin()).to.throw();
    });

    describe("pathToUrl matches the Node.js implementation", () => {
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
          expect(browserPathToUrl(cwd, path)).to.equal(pathToUrl(cwd, path));
        });
      }
    });
  });
});
