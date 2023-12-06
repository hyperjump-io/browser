import { describe, it, beforeEach, expect } from "vitest";
import { get } from "../index.js";

import type { Browser, Document } from "../index.js";
import { Reference } from "../jref/index.js";


describe("JSON Browser", () => {
  describe("registry", () => {
    const testDomain = "https://example.com";
    const anchorLocation = (fragment: string | undefined) => fragment ?? "";
    let browser: Browser;

    beforeEach(() => {
      const embedded: Record<string, Document> = {};

      embedded[`${testDomain}/foo`] = {
        baseUri: `${testDomain}/foo`,
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

      embedded[`${testDomain}/registered`] = {
        baseUri: `${testDomain}/registered`,
        root: {
          foo: new Reference("/foo")
        },
        anchorLocation,
        embedded
      };

      const cachedDocument = {
        baseUri: `${testDomain}/cached`,
        root: {
          foo: new Reference("/main")
        },
        anchorLocation,
        embedded
      };

      const registeredDocument = {
        baseUri: `${testDomain}/registered`,
        root: {
          foo: new Reference("/main")
        },
        anchorLocation
      };

      const mainDocument = {
        baseUri: `${testDomain}/main`,
        root: {
          aaa: new Reference("/registered"),
          bbb: new Reference("/registered#/foo"),
          ccc: new Reference("/cached#/foo")
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
          [`${testDomain}/cached`]: { source: "https", document: cachedDocument },
          [`${testDomain}/registered`]: { source: "registry", document: registeredDocument }
        }
      };
    });

    it("reference registered document", async () => {
      const foo = await get("#/aaa", browser);

      expect(foo.uri).to.equal(`${testDomain}/registered`);
    });

    it("registered document takes precedence over embedded document", async () => {
      const foo = await get("#/bbb", browser);

      expect(foo.uri).to.equal(`${testDomain}/main`);
    });

    it("embbeded document takes precedence over cached document", async () => {
      const foo = await get("#/ccc", browser);

      expect(foo.uri).to.equal(`${testDomain}/foo`);
    });
  });
});
