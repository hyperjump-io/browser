import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { addMediaTypePlugin, removeMediaTypePlugin, get } from "../index.js";
import { Reference } from "../jref/index.js";

import type { Browser, Document } from "../index.js";


describe("JSON Browser", () => {
  describe("registry", () => {
    const testDomain = "https://example.com";
    const anchorLocation = (fragment: string | undefined) => fragment ?? "";
    let mockAgent: MockAgent;
    let browser: Browser;

    beforeEach(async () => {
      mockAgent = new MockAgent();
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);

      addMediaTypePlugin("application/prs.hyperjump-registry", {
        parse: async () => {
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

          return {
            baseUri: `${testDomain}/main`,
            root: {
              aaa: new Reference("/registered"),
              bbb: new Reference("/registered#/foo"),
              ccc: new Reference("/cached#/foo")
            },
            anchorLocation,
            embedded
          };
        },
        fileMatcher: async (path) => path.endsWith(".registry")
      });

      const registeredDocument = {
        baseUri: `${testDomain}/registered`,
        root: {
          foo: new Reference("/main")
        },
        anchorLocation
      };

      browser = { _cache: { [registeredDocument.baseUri]: { source: "registry", document: registeredDocument } } } as unknown as Browser;

      const cached = `{
        "foo": { "$href": "/main" }
      }`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/cached" })
        .reply(200, cached, { headers: { "content-type": "application/reference+json" } });
      browser = await get(`${testDomain}/cached`, browser);

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, "", { headers: { "content-type": "application/prs.hyperjump-registry" } });
      browser = await get(`${testDomain}/main`, browser);
    });

    afterEach(async () => {
      await mockAgent.close();

      removeMediaTypePlugin("application/prs.hyperjump-registry");
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
