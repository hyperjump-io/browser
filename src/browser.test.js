import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, test, expect } from "vitest";
import { build } from "vite";
import { contextUri } from "./hyperjump/context-uri.browser.js";
import { defaultUriSchemePlugins } from "./hyperjump/uri-schemes/default-uri-scheme-plugins.browser.js";
import { FileUriSchemePlugin } from "./hyperjump/uri-schemes/file-scheme-plugin.browser.js";
import { pathToUri as browserPathToUri } from "./jref/path-to-uri.browser.js";
import { pathToUri } from "./jref/path-to-uri.js";
import { Hyperjump } from "./hyperjump/index.js";

/**
 * @typedef {{
 *   exports: Record<string, string>;
 * }} Package
 */

const packageJsonUrl = new URL("../package.json", import.meta.url);

/** @type Package */
const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));

describe("Browser compatibility", () => {
  for (const [subpath, entryPoint] of Object.entries(packageJson.exports)) {
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
    test("contextUri is the document's location", () => {
      const location = "https://example.com/foo/bar.html";
      Object.defineProperty(globalThis, "document", { value: { location }, configurable: true });
      try {
        expect(contextUri()).to.equal(location);
      } finally {
        Reflect.deleteProperty(globalThis, "document");
      }
    });

    test("contextUri is empty without a document", () => {
      expect(contextUri()).to.equal("");
    });

    test("the file: scheme isn't a default URI scheme", () => {
      const schemes = defaultUriSchemePlugins(new Hyperjump()).flatMap((plugin) => plugin.schemes);
      expect(schemes).to.eql(["http", "https"]);
    });

    test("FileUriSchemePlugin can't be constructed", () => {
      expect(() => new FileUriSchemePlugin(new Hyperjump())).to.throw();
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
