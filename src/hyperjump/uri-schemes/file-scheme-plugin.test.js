import { mkdir, realpath, rm, writeFile, symlink } from "node:fs/promises";
import { cwd } from "node:process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { FileNotFoundError, Hyperjump, RetrievalError } from "../index.js";
import { toJson } from "../../json/jsonast-util.js";

describe("JSON Browser", () => {
  describe("get", () => {
    describe("`file:` scheme", () => {
      const fixtureDirectory = "__test-fixtures__";
      const testUri = pathToFileURL(cwd()).toString();
      const testPath = fileURLToPath(`${testUri}/${fixtureDirectory}`);

      beforeEach(async () => {
        await mkdir(testPath, { recursive: true });
      });

      afterEach(async () => {
        await rm(testPath, { recursive: true, force: true });
      });

      test("not found", async () => {
        const hyperjump = new Hyperjump();
        const session = hyperjump.session();
        try {
          await session.get("nothing-here.jref");
          expect.fail("Expected Error: ENOENT: no such file or directory");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          expect(retrievalError.cause).to.be.instanceof(FileNotFoundError);
        }
      });

      // An absolute path would reveal where the files are on the machine
      test("a missing file's messages are relative to the working directory", async () => {
        const missing = `${testUri}/${fixtureDirectory}/schemas/missing.jref`;
        const session = new Hyperjump().session();
        const error = await session.get(missing)
          .catch((/** @type unknown */ error) => error);

        expect(error).to.be.instanceof(RetrievalError);
        const retrievalError = /** @type RetrievalError */ (error);
        expect(retrievalError.message).to.equal(`Unable to load resource '${fixtureDirectory}/schemas/missing.jref'`);
        expect(retrievalError.uri).to.equal(missing);
        const cause = /** @type FileNotFoundError */ (retrievalError.cause);
        expect(cause.message).to.equal(`There's no file at '${fixtureDirectory}/schemas/missing.jref'`);
        expect(cause.uri).to.equal(missing);
      });

      test("unknown content type", async () => {
        const path = `${fixtureDirectory}/foo.yaml`;
        const jref = `foo: 42`;

        await writeFile(fileURLToPath(`${testUri}/${path}`), jref);

        const hyperjump = new Hyperjump();
        const session = hyperjump.session();
        try {
          await session.get(path);
          expect.fail("Expected RetrievalError => UnsupportedMediaTypeError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.name).to.equal("UnsupportedMediaTypeError");
        }
      });

      test("/.jref is not a JRef file", async () => {
        const path = `${fixtureDirectory}/.jref`;
        const jref = `foo: 42`;

        await writeFile(fileURLToPath(`${testUri}/${path}`), jref);

        const hyperjump = new Hyperjump();
        const session = hyperjump.session();
        try {
          await session.get(path);
          expect.fail("Expected RetrievalError => UnsupportedMediaTypeError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.name).to.equal("UnsupportedMediaTypeError");
        }
      });

      describe("http context", () => {
        /** @type MockAgent */
        let mockAgent;

        const testDomain = "https://example.com";

        beforeEach(() => {
          mockAgent = new MockAgent();
          mockAgent.disableNetConnect();
          setGlobalDispatcher(mockAgent);
        });

        afterEach(async () => {
          await mockAgent.close();
        });

        test("file references not allowed from non-filesystem context", async () => {
          const fooUri = `${testUri}/${fixtureDirectory}/foo.jref`;
          await writeFile(fileURLToPath(fooUri), `42`);

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/main" })
            .reply(200, `{ "$ref": "${fooUri}" }`, { headers: { "content-type": "application/reference+json" } });

          const hyperjump = new Hyperjump({ allowRetrieval: [`${testDomain}/`, "./"] });
          const result = hyperjump.session().get(`${testDomain}/main`);

          await expect(result).rejects.toBeInstanceOf(RetrievalError);
          await expect(result).rejects.toHaveProperty("cause.message", expect.stringContaining("non-filesystem context"));
        });

        test("file references through another scheme's plugin aren't allowed from non-filesystem context", async () => {
          const fooUri = `${testUri}/${fixtureDirectory}/foo.jref`;
          await writeFile(fileURLToPath(fooUri), `42`);

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/main" })
            .reply(200, `{ "$ref": "urn:example:foo" }`, { headers: { "content-type": "application/reference+json" } });

          const hyperjump = new Hyperjump({
            allowRetrieval: [`${testDomain}/`, "urn:example:foo", "./"],
            uriSchemePlugins: [{
              schemes: ["urn"],
              retrieve: async () => Response.redirect(fooUri)
            }]
          });
          const result = hyperjump.session().get(`${testDomain}/main`);

          await expect(result).rejects.toBeInstanceOf(RetrievalError);
          await expect(result).rejects.toHaveProperty("cause.message", expect.stringContaining("non-filesystem context"));
        });

        test("a URN that maps to a file is retrieved", async () => {
          const fooUri = `${testUri}/${fixtureDirectory}/foo.jref`;
          await writeFile(fileURLToPath(fooUri), `42`);

          const hyperjump = new Hyperjump({
            allowRetrieval: ["urn:example:foo", "./"],
            uriSchemePlugins: [{
              schemes: ["urn"],
              retrieve: async () => Response.redirect(fooUri)
            }]
          });
          const subject = await hyperjump.session().get("urn:example:foo");

          expect(toJson(subject)).to.equal(`42`);
        });

        test("a reference from a file to a URN that maps to a file is followed", async () => {
          const mainUri = `${testUri}/${fixtureDirectory}/main.jref`;
          const fooUri = `${testUri}/${fixtureDirectory}/foo.jref`;
          await writeFile(fileURLToPath(mainUri), `{ "$ref": "urn:example:foo" }`);
          await writeFile(fileURLToPath(fooUri), `42`);

          const hyperjump = new Hyperjump({
            allowRetrieval: ["urn:example:foo", "./"],
            uriSchemePlugins: [{
              schemes: ["urn"],
              retrieve: async () => Response.redirect(fooUri)
            }]
          });
          const subject = await hyperjump.session().get(mainUri);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("file references are allowed from file context", async () => {
          const mainPath = `${fixtureDirectory}/main.jref`;
          const fooPath = `${fixtureDirectory}/foo.jref`;
          const uri = `${testUri}/${mainPath}`;

          await writeFile(fileURLToPath(uri), `{ "$ref": "foo.jref" }`);
          await writeFile(fileURLToPath(`${testUri}/${fooPath}`), `42`);

          const hyperjump = new Hyperjump();
          const session = hyperjump.session();
          const subject = await session.get(mainPath);

          expect(toJson(subject)).to.equal(`42`);
        });
      });

      describe("success", () => {
        test("cwd relative path", async () => {
          const path = `${fixtureDirectory}/foo.jref`;

          await writeFile(fileURLToPath(`${testUri}/${path}`), `{ "foo": 42 }`);

          const hyperjump = new Hyperjump();
          const session = hyperjump.session();
          const subject = await session.get(`${path}#/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("full path", async () => {
          const path = fileURLToPath(`${testUri}/${fixtureDirectory}/foo.jref`, { windows: false });

          await writeFile(fileURLToPath(pathToFileURL(path, { windows: false })), `{ "foo": 42 }`);

          const hyperjump = new Hyperjump();
          const session = hyperjump.session();
          const subject = await session.get(`${path}#/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("full URI with authority", async () => {
          const path = fileURLToPath(`${testUri}/${fixtureDirectory}/foo.jref`, { windows: false });

          await writeFile(fileURLToPath(pathToFileURL(path, { windows: false })), `{ "foo": 42 }`);

          const hyperjump = new Hyperjump();
          const session = hyperjump.session();
          const subject = await session.get(`file://${path}#/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("full URI without authority", async () => {
          const path = fileURLToPath(`${testUri}/${fixtureDirectory}/foo.jref`);

          await writeFile(path, `{ "foo": 42 }`);

          const hyperjump = new Hyperjump();
          const session = hyperjump.session();
          const subject = await session.get(`file:${path}#/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });
      });

      test("symlink", async () => {
        const path = `${fixtureDirectory}/symlink-foo.jref`;
        const actualPath = `${fixtureDirectory}/foo.jref`;

        await writeFile(fileURLToPath(`${testUri}/${actualPath}`), `{ "foo": 42 }`);
        await symlink(fileURLToPath(`${testUri}/${actualPath}`), join(cwd(), path));

        const hyperjump = new Hyperjump();
        const session = hyperjump.session();
        const subject = await session.get(`${path}#/foo`);

        expect(toJson(subject)).to.equal(`42`);
      });

      test("relative symlink resolves references relative to the target", async () => {
        const subdirectory = join(testPath, "sub");
        await mkdir(subdirectory);
        await writeFile(join(subdirectory, "foo.jref"), `{ "foo": { "$ref": "bar.jref" } }`);
        await writeFile(join(subdirectory, "bar.jref"), `42`);
        await symlink("foo.jref", join(subdirectory, "symlink-foo.jref"));

        const hyperjump = new Hyperjump();
        const session = hyperjump.session();
        const subject = await session.get(`${fixtureDirectory}/sub/symlink-foo.jref#/foo`);

        expect(toJson(subject)).to.equal(`42`);
      });

      test("a file in a symlinked directory resolves references relative to the target", async () => {
        // `linked/../bar.jref` is `bar.jref`, but `real/../bar.jref` is `deep/bar.jref`
        await mkdir(join(testPath, "deep", "real"), { recursive: true });
        await writeFile(join(testPath, "deep", "real", "foo.jref"), `{ "foo": { "$ref": "../bar.jref" } }`);
        await writeFile(join(testPath, "deep", "bar.jref"), `"target"`);
        await writeFile(join(testPath, "bar.jref"), `"link"`);
        await symlink(join(testPath, "deep", "real"), join(testPath, "linked"));

        const hyperjump = new Hyperjump();
        const session = hyperjump.session();
        const subject = await session.get(`${fixtureDirectory}/linked/foo.jref#/foo`);

        expect(toJson(subject)).to.equal(`"target"`);
      });

      test("the response's URL is the real path", async () => {
        await mkdir(join(testPath, "real"));
        await writeFile(join(testPath, "real", "foo.jref"), `42`);
        await symlink(join(testPath, "real"), join(testPath, "linked"));

        const session = new Hyperjump().session();
        const document = await session.getDocument(`${testUri}/${fixtureDirectory}/linked/foo.jref`);

        // A JRef document's URI is its response's URL
        expect(document.uri).to.equal(pathToFileURL(await realpath(join(testPath, "real", "foo.jref"))).toString());
      });

      test("without a symlink, the response's URL is the requested URI", async () => {
        await writeFile(join(testPath, "foo.jref"), `42`);

        const session = new Hyperjump().session();
        const document = await session.getDocument(`${testUri}/${fixtureDirectory}/foo.jref#/foo`);

        expect(document.uri).to.equal(`${testUri}/${fixtureDirectory}/foo.jref`);
      });

      test("chained symlinks", async () => {
        await writeFile(join(testPath, "foo.jref"), `{ "foo": { "$ref": "bar.jref" } }`);
        await writeFile(join(testPath, "bar.jref"), `42`);
        await symlink("foo.jref", join(testPath, "symlink-foo.jref"));
        await symlink("symlink-foo.jref", join(testPath, "symlink-symlink-foo.jref"));

        const hyperjump = new Hyperjump();
        const session = hyperjump.session();
        const subject = await session.get(`${fixtureDirectory}/symlink-symlink-foo.jref#/foo`);

        expect(toJson(subject)).to.equal(`42`);
      });
    });
  });
});
