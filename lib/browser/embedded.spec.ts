import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, addMediaTypePlugin, removeMediaTypePlugin } from "../index.js";
import { Reference } from "../jref/index.js";

import type{ Browser, Document } from "../index.js";


describe("JSON Browser", () => {
  describe("embedded", () => {
    const testDomain = "https://test.hyperjump.io";
    let mockAgent: MockAgent;
    let browser: Browser;

    beforeEach(async () => {
      mockAgent = new MockAgent();
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);

      addMediaTypePlugin("application/prs.hyperjump-embedded", {
        parse: async () => {
          const embedded: Record<string, Document> = {};
          const anchorLocation = (fragment: string | undefined) => fragment ?? "";

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

          return {
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
        },
        fileMatcher: async (path) => path.endsWith(".embedded")
      });

      const cached = `{
        "foo": { "$href": "/bar" }
      }`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/cached" })
        .reply(200, cached, { headers: { "content-type": "application/reference+json" } });
      browser = await get(`${testDomain}/cached`);

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, "", { headers: { "content-type": "application/prs.hyperjump-embedded" } });
      browser = await get(`${testDomain}/main`, browser);
    });

    afterEach(async () => {
      await mockAgent.close();

      removeMediaTypePlugin("application/prs.hyperjump-embedded");
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
