import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { cwd } from "node:process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump, RetrievalError } from "../index.js";
import { toJref } from "../../jref/jref-util.js";


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
        try {
          await hyperjump.get("nothing-here.jref");
          expect.fail("Expected Error: ENOENT: no such file or directory");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.message).to.contain("ENOENT: no such file or directory");
        }
      });

      test("unknown content type", async () => {
        const path = `${fixtureDirectory}/foo.yaml`;
        const jref = `foo: 42`;

        await writeFile(fileURLToPath(`${testUri}/${path}`), jref);

        const hyperjump = new Hyperjump();
        try {
          await hyperjump.get(path);
          expect.fail("Expected RetrievalError => UnknownMediaTypeError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.name).to.equal("UnknownMediaTypeError");
        }
      });

      test("/.jref is not a JRef file", async () => {
        const path = `${fixtureDirectory}/.jref`;
        const jref = `foo: 42`;

        await writeFile(fileURLToPath(`${testUri}/${path}`), jref);

        const hyperjump = new Hyperjump();
        try {
          await hyperjump.get(path);
          expect.fail("Expected RetrievalError => UnknownMediaTypeError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.name).to.equal("UnknownMediaTypeError");
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
          const jref = `{ "$ref": "${testUri}/foo.jref" }`;

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/main" })
            .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

          const hyperjump = new Hyperjump();

          try {
            const uri = `${testDomain}/main`;
            await hyperjump.get(uri);
            expect.fail("Expected Error: Accessing a file from a non-filesystem document is not allowed");
          } catch (error) {
            expect(error).to.be.instanceof(Error);
          }
        });

        test("file references are allowed from file context", async () => {
          const mainPath = `${fixtureDirectory}/main.jref`;
          const fooPath = `${fixtureDirectory}/foo.jref`;
          const uri = `${testUri}/${mainPath}`;

          await writeFile(fileURLToPath(uri), `{ "$ref": "foo.jref" }`);
          await writeFile(fileURLToPath(`${testUri}/${fooPath}`), `42`);

          const hyperjump = new Hyperjump();
          const subject = await hyperjump.get(mainPath);

          expect(toJref(/** @type NonNullable<any> */ (subject), uri)).to.equal(`42`);
        });
      });

      describe("success", () => {
        test("cwd relative path", async () => {
          const path = `${fixtureDirectory}/foo.jref`;

          await writeFile(fileURLToPath(`${testUri}/${path}`), `{ "foo": 42 }`);

          const hyperjump = new Hyperjump();
          const subject = await hyperjump.get(`${path}#/foo`);

          expect(toJref(/** @type NonNullable<any> */ (subject), `${testUri}/foo.jref`)).to.equal(`42`);
        });

        test("full path", async () => {
          const path = fileURLToPath(`${testUri}/${fixtureDirectory}/foo.jref`, { windows: false });

          await writeFile(fileURLToPath(pathToFileURL(path, { windows: false })), `{ "foo": 42 }`);

          const hyperjump = new Hyperjump();
          const subject = await hyperjump.get(`${path}#/foo`);

          expect(toJref(/** @type NonNullable<any> */ (subject), `${testUri}/foo.jref`)).to.equal(`42`);
        });

        test("full URI with authority", async () => {
          const path = fileURLToPath(`${testUri}/${fixtureDirectory}/foo.jref`, { windows: false });

          await writeFile(fileURLToPath(pathToFileURL(path, { windows: false })), `{ "foo": 42 }`);

          const hyperjump = new Hyperjump();
          const subject = await hyperjump.get(`file://${path}#/foo`);

          expect(toJref(/** @type NonNullable<any> */ (subject), `${testUri}/foo.jref`)).to.equal(`42`);
        });

        test("full URI without authority", async () => {
          const path = fileURLToPath(`${testUri}/${fixtureDirectory}/foo.jref`);

          await writeFile(path, `{ "foo": 42 }`);

          const hyperjump = new Hyperjump();
          const subject = await hyperjump.get(`file:${path}#/foo`);

          expect(toJref(/** @type NonNullable<any> */ (subject), `${testUri}/foo.jref`)).to.equal(`42`);
        });
      });

      test("symlink", async () => {
        const path = `${fixtureDirectory}/symlink-foo.jref`;
        const actualPath = `${fixtureDirectory}/foo.jref`;

        await writeFile(fileURLToPath(`${testUri}/${actualPath}`), `{ "foo": 42 }`);
        await symlink(fileURLToPath(`${testUri}/${actualPath}`), join(cwd(), path));

        const hyperjump = new Hyperjump();
        const subject = await hyperjump.get(`${path}#/foo`);

        expect(toJref(/** @type NonNullable<any> */ (subject), `${testUri}/foo.jref`)).to.equal(`42`);
      });
    });
  });
});
