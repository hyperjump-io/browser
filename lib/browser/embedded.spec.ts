import { describe, it, beforeEach, expect } from "vitest";
import { get } from "../index.js";
import { Reference } from "../jref/index.js";

import type{ Browser, Document } from "../index.js";


describe("JSON Browser", () => {
  describe("embedded", () => {
    const testDomain = "https://example.com";
    const anchorLocation = (fragment: string | undefined) => fragment ?? "";
    let browser: Browser;

    beforeEach(() => {
      const embedded: Record<string, Document> = {};

      embedded[`${testDomain}/foo`] = {
        baseUri: `${testDomain}/foo`,
        root: {
          main: new Reference("/main"),
          bar: new Reference("/bar")
        },
        anchorLocation,
        embedded
      };

      embedded[`${testDomain}/bar`] = {
        baseUri: `${testDomain}/bar`,
        root: {},
        anchorLocation,
        embedded
      };

      embedded[`${testDomain}/cached`] = {
        baseUri: `${testDomain}/cached`,
        root: {
          foo: new Reference("/foo")
        },
        anchorLocation,
        embedded
      };

      const cachedDocument = {
        baseUri: `${testDomain}/cached`,
        root: {
          foo: new Reference("/bar")
        },
        anchorLocation,
        embedded
      };

      const mainDocument = {
        baseUri: `${testDomain}/main`,
        root: {
          aaa: 42,
          bbb: new Reference("/foo"),
          ccc: new Reference("/foo#/main"),
          ddd: new Reference("/foo#/bar"),
          eee: new Reference("/cached#/foo")
        },
        anchorLocation,
        embedded
      };

      browser = {
        uri: `${testDomain}/main`,
        cursor: "",
        document: mainDocument,
        cache: {
          [`${testDomain}/main`]: { source: "https", document: mainDocument },
          [`${testDomain}/cached`]: { source: "https", document: cachedDocument }
        }
      };
    });

    it("getting an embedded document", async () => {
      const foo = await get("/foo", browser);

      expect(foo.uri).to.equal(`${testDomain}/foo`);
    });

    it("getting the main document from an embedded document", async () => {
      const foo = await get("/foo", browser);
      const main = await get("/main", foo);

      expect(main.uri).to.equal(`${testDomain}/main`);
    });

    it("getting an embedded document from an embedded document", async () => {
      const foo = await get("/foo", browser);
      const bar = await get("/bar", foo);

      expect(bar.uri).to.equal(`${testDomain}/bar`);
    });

    it("referencing an embedded document", async () => {
      const foo = await get("#/bbb", browser);

      expect(foo.uri).to.equal(`${testDomain}/foo`);
    });

    it("referencing the main document from an embedded document", async () => {
      const foo = await get("#/ccc", browser);

      expect(foo.uri).to.equal(`${testDomain}/main`);
    });

    it("referencing an embedded document from an embedded document", async () => {
      const foo = await get("#/ddd", browser);

      expect(foo.uri).to.equal(`${testDomain}/bar`);
    });

    it("an embedded document takes precence over a cached document", async () => {
      const foo = await get("#/eee", browser);

      expect(foo.uri).to.equal(`${testDomain}/foo`);
    });
  });
});
