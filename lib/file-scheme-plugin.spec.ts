import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { expect } from "chai";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, UnknownMediaTypeError } from "./index.js";
import { Reference } from "./jref/index.js";

import type { Document } from "./index.js";


describe("JSON Browser", () => {
  describe("get", () => {
    describe("`file:` scheme", () => {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const fixtureDirectory = "__test-fixtures__";
      const testUri = dirname(import.meta.url);

      beforeEach(async () => {
        await mkdir(`${__dirname}/${fixtureDirectory}`);
      });

      afterEach(async () => {
        await rm(`${__dirname}/${fixtureDirectory}`, { recursive: true });
      });

      it("not found", async () => {
        try {
          await get("nothing-here.jref");
          expect.fail("Expected Error: ENOENT: no such file or directory");
        } catch (error: unknown) {
          expect(error).to.be.instanceof(Error);
          expect((error as Error).message).to.contain("ENOENT: no such file or directory");
        }
      });

      it("unknown content type", async () => {
        const path = `${fixtureDirectory}/foo.yaml`;
        const jref = `
foo: 42
`;

        await writeFile(`${__dirname}/${path}`, jref, { flag: "w+" });

        try {
          await get(path);
          expect.fail("Expected UnknownMediaTypeError");
        } catch (error: unknown) {
          expect(error).to.be.instanceof(UnknownMediaTypeError);
        }
      });

      describe("http context", () => {
        let document: Document;

        beforeEach(async () => {
          const mockAgent = new MockAgent();
          mockAgent.disableNetConnect();
          setGlobalDispatcher(mockAgent);

          const testDomain = "https://example.com";
          const path = "/root";

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: path })
            .reply(200, "{}", { headers: { "content-type": "application/reference+json" } });

          document = await get(testDomain + path);

          await mockAgent.close();
        });

        it("file references only allowed from file context", async () => {
          try {
            await get(`${testUri}/foo.jref`, document);
            expect.fail("Expected Error: Accessing a file from a non-filesystem document is not allowed");
          } catch (error: unknown) {
            expect(error).to.be.instanceof(Error);
          }
        });
      });

      describe("success", () => {
        it("caller file relative path", async () => {
          const path = `${fixtureDirectory}/foo.jref`;
          const fragment = "/foo";
          const href = "#/foo";
          const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

          await writeFile(`${__dirname}/${path}`, jref, { flag: "w+" });

          const browser = await get(`${path}#${fragment}`);

          expect(browser.baseUri).to.equal(`${testUri}/${path}`);
          expect(browser.cursor).to.equal(fragment);
          expect(browser.root).to.eql({ foo: 42, bar: new Reference(href) });
        });

        it("full path", async () => {
          const path = `${__dirname}/${fixtureDirectory}/foo.jref`;
          const fragment = "/foo";
          const href = "#/foo";
          const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

          await writeFile(path, jref, { flag: "w+" });

          const browser = await get(`${path}#${fragment}`);

          expect(browser.baseUri).to.equal(`file://${path}`);
          expect(browser.cursor).to.equal(fragment);
          expect(browser.root).to.eql({ foo: 42, bar: new Reference(href) });
        });

        it("full URI with authority", async () => {
          const path = `${__dirname}/${fixtureDirectory}/foo.jref`;
          const fragment = "/foo";
          const href = "#/foo";
          const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

          await writeFile(path, jref, { flag: "w+" });

          const browser = await get(`file://${path}#${fragment}`);

          expect(browser.baseUri).to.equal(`file://${path}`);
          expect(browser.cursor).to.equal(fragment);
          expect(browser.root).to.eql({ foo: 42, bar: new Reference(href) });
        });

        it("full URI without authority", async () => {
          const path = `${__dirname}/${fixtureDirectory}/foo.jref`;
          const fragment = "/foo";
          const href = "#/foo";
          const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

          await writeFile(path, jref, { flag: "w+" });

          const browser = await get(`file:${path}#${fragment}`);

          expect(browser.baseUri).to.equal(`file:${path}`);
          expect(browser.cursor).to.equal(fragment);
          expect(browser.root).to.eql({ foo: 42, bar: new Reference(href) });
        });
      });

      it("symlink", async () => {
        const path = `${fixtureDirectory}/symlink-foo.jref`;
        const actualPath = `${fixtureDirectory}/foo.jref`;
        const fragment = "/foo";
        const href = "/bar";
        const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

        await writeFile(`${__dirname}/${actualPath}`, jref, { flag: "w+" });
        await symlink(`${__dirname}/${actualPath}`, `${__dirname}/${path}`);

        const browser = await get(`${path}#${fragment}`);

        expect(browser.baseUri).to.equal(`${testUri}/${actualPath}`);
        expect(browser.cursor).to.equal(fragment);
        expect(browser.root).to.eql({ foo: 42, bar: new Reference("#/foo") });
      });
    });
  });
});
