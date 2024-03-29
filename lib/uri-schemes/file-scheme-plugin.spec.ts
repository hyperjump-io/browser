import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { cwd } from "node:process";
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, RetrievalError } from "../index.js";
import { Reference } from "../jref/index.js";

import type { Browser } from "../index.js";


describe("JSON Browser", () => {
  describe("get", () => {
    describe("`file:` scheme", () => {
      const fixtureDirectory = "__test-fixtures__";
      const testUri = `file://${cwd()}`;

      beforeEach(async () => {
        await mkdir(`${cwd()}/${fixtureDirectory}`);
      });

      afterEach(async () => {
        await rm(`${cwd()}/${fixtureDirectory}`, { recursive: true });
      });

      it("not found", async () => {
        try {
          await get("nothing-here.jref");
          expect.fail("Expected Error: ENOENT: no such file or directory");
        } catch (error: unknown) {
          expect(error).to.be.instanceof(RetrievalError);
          expect((error as RetrievalError).cause.message).to.contain("ENOENT: no such file or directory");
        }
      });

      it("unknown content type", async () => {
        const path = `${fixtureDirectory}/foo.yaml`;
        const jref = `
foo: 42
`;

        await writeFile(`${cwd()}/${path}`, jref, { flag: "w+" });

        try {
          await get(path);
          expect.fail("Expected RetrievalError => UnknownMediaTypeError");
        } catch (error: unknown) {
          expect(error).to.be.instanceof(RetrievalError);
          expect((error as RetrievalError).cause.name).to.equal("UnknownMediaTypeError");
        }
      });

      describe("http context", () => {
        let browser: Browser;

        beforeEach(async () => {
          const mockAgent = new MockAgent();
          mockAgent.disableNetConnect();
          setGlobalDispatcher(mockAgent);

          const testDomain = "https://example.com";
          const path = "/root";

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: path })
            .reply(200, "{}", { headers: { "content-type": "application/reference+json" } });

          browser = await get(testDomain + path);

          await mockAgent.close();
        });

        it("file references not allowed from non-filesystem context", async () => {
          try {
            await get(`${testUri}/foo.jref`, browser);
            expect.fail("Expected Error: Accessing a file from a non-filesystem document is not allowed");
          } catch (error: unknown) {
            expect(error).to.be.instanceof(Error);
          }
        });

        it("file references are allowed from file context", async () => {
          const rootPath = `${fixtureDirectory}/root.jref`;
          const fooPath = `${fixtureDirectory}/foo.jref`;
          const jref = "{}";

          await writeFile(`${cwd()}/${rootPath}`, jref, { flag: "w+" });
          await writeFile(`${cwd()}/${fooPath}`, jref, { flag: "w+" });

          const root = await get(rootPath);
          const browser = await get(`./foo.jref`, root);

          expect(browser.uri).to.equal(`${testUri}/${fooPath}`);
          expect(browser.cursor).to.equal("");
          expect(browser.document.baseUri).to.equal(`${testUri}/${fooPath}`);
          expect(browser.document.root).to.eql({});
        });
      });

      describe("success", () => {
        it("cwd relative path", async () => {
          const path = `${fixtureDirectory}/foo.jref`;
          const fragment = "/foo";
          const href = "#/foo";
          const jref = `{
  "foo": 42,
  "bar": { "$ref": "${href}" }
}`;

          await writeFile(`${cwd()}/${path}`, jref, { flag: "w+" });

          const browser = await get(`${path}#${fragment}`);

          expect(browser.uri).to.equal(`${testUri}/${path}#${fragment}`);
          expect(browser.cursor).to.equal(fragment);
          expect(browser.document.baseUri).to.equal(`${testUri}/${path}`);
          expect(browser.document.root).to.eql({ foo: 42, bar: new Reference(href) });
        });

        it("full path", async () => {
          const path = `${cwd()}/${fixtureDirectory}/foo.jref`;
          const fragment = "/foo";
          const href = "#/foo";
          const jref = `{
  "foo": 42,
  "bar": { "$ref": "${href}" }
}`;

          await writeFile(path, jref, { flag: "w+" });

          const browser = await get(`${path}#${fragment}`);

          expect(browser.uri).to.equal(`file://${path}#${fragment}`);
          expect(browser.cursor).to.equal(fragment);
          expect(browser.document.baseUri).to.equal(`file://${path}`);
          expect(browser.document.root).to.eql({ foo: 42, bar: new Reference(href) });
        });

        it("full URI with authority", async () => {
          const path = `${cwd()}/${fixtureDirectory}/foo.jref`;
          const fragment = "/foo";
          const href = "#/foo";
          const jref = `{
  "foo": 42,
  "bar": { "$ref": "${href}" }
}`;

          await writeFile(path, jref, { flag: "w+" });

          const browser = await get(`file://${path}#${fragment}`);

          expect(browser.uri).to.equal(`file://${path}#${fragment}`);
          expect(browser.cursor).to.equal(fragment);
          expect(browser.document.baseUri).to.equal(`file://${path}`);
          expect(browser.document.root).to.eql({ foo: 42, bar: new Reference(href) });
        });

        it("full URI without authority", async () => {
          const path = `${cwd()}/${fixtureDirectory}/foo.jref`;
          const fragment = "/foo";
          const href = "#/foo";
          const jref = `{
  "foo": 42,
  "bar": { "$ref": "${href}" }
}`;

          await writeFile(path, jref, { flag: "w+" });

          const browser = await get(`file:${path}#${fragment}`);

          expect(browser.uri).to.equal(`file:${path}#${fragment}`);
          expect(browser.cursor).to.equal(fragment);
          expect(browser.document.baseUri).to.equal(`file:${path}`);
          expect(browser.document.root).to.eql({ foo: 42, bar: new Reference(href) });
        });
      });

      it("symlink", async () => {
        const path = `${fixtureDirectory}/symlink-foo.jref`;
        const actualPath = `${fixtureDirectory}/foo.jref`;
        const fragment = "/foo";
        const href = "/bar";
        const jref = `{
  "foo": 42,
  "bar": { "$ref": "${href}" }
}`;

        await writeFile(`${cwd()}/${actualPath}`, jref, { flag: "w+" });
        await symlink(`${cwd()}/${actualPath}`, `${cwd()}/${path}`);

        const browser = await get(`${path}#${fragment}`);

        expect(browser.uri).to.equal(`${testUri}/${actualPath}#${fragment}`);
        expect(browser.cursor).to.equal(fragment);
        expect(browser.document.baseUri).to.equal(`${testUri}/${actualPath}`);
        expect(browser.document.root).to.eql({ foo: 42, bar: new Reference("#/foo") });
      });
    });
  });
});
