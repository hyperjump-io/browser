import { describe, it, beforeEach, afterEach, expect, beforeAll, afterAll } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, addMediaTypePlugin, removeMediaTypePlugin } from "../index.js";
import { parse, stringify } from "../jref/index.js";

import type { Document } from "../index.js";
import type { JRefObject } from "../jref/index.js";


describe("JSON Browser", () => {
  describe("embedded", () => {
    const testDomain = "https://test.hyperjump.io";
    const testMediaType = "application/prs.hyperjump-embedded-test";

    beforeAll(() => {
      const parseToDocument = (url: string, text: string, embedded: Record<string, Document> = {}): Document => {
        return {
          baseUri: url,
          root: parse(text, (key, value) => {
            if (key === "$embedded") {
              for (const uri in value as JRefObject) {
                embedded[uri] = parseToDocument(uri, stringify((value as JRefObject)[uri]), embedded);
              }
              return;
            } else {
              return value;
            }
          }),
          anchorLocation: (fragment: string | undefined) => fragment ?? "",
          embedded: embedded
        };
      };
      addMediaTypePlugin(testMediaType, {
        parse: async (response) => parseToDocument(response.url, await response.text()),
        fileMatcher: async (path) => path.endsWith(".embedded")
      });
    });

    afterAll(() => {
      removeMediaTypePlugin(testMediaType);
    });

    let mockAgent: MockAgent;

    beforeEach(async () => {
      mockAgent = new MockAgent();
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);
    });

    afterEach(async () => {
      await mockAgent.close();
    });

    it("getting an embedded document", async () => {
      const jrefEmbedded = `{
        "$embedded": {
          "${testDomain}/foo": {}
        }
      }`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, jrefEmbedded, { headers: { "content-type": testMediaType } });
      const main = await get(`${testDomain}/main`);
      const subject = await get("/foo", main);

      expect(subject.uri).to.equal(`${testDomain}/foo`);
    });

    it("getting the main document from an embedded document", async () => {
      const jrefEmbedded = `{
        "$embedded": {
          "${testDomain}/foo": {}
        }
      }`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, jrefEmbedded, { headers: { "content-type": testMediaType } });
      const main = await get(`${testDomain}/main`);
      const foo = await get("/foo", main);
      const subject = await get("/main", foo);

      expect(subject.uri).to.equal(`${testDomain}/main`);
    });

    it("getting an embedded document from an embedded document", async () => {
      const jrefEmbedded = `{
        "$embedded": {
          "${testDomain}/foo": {},
          "${testDomain}/bar": {}
        }
      }`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, jrefEmbedded, { headers: { "content-type": testMediaType } });
      const main = await get(`${testDomain}/main`);
      const foo = await get("/foo", main);
      const subject = await get("/bar", foo);

      expect(subject.uri).to.equal(`${testDomain}/bar`);
    });

    it("referencing an embedded document", async () => {
      const jrefEmbedded = `{
        "foo": { "$href": "/foo" },

        "$embedded": {
          "${testDomain}/foo": {}
        }
      }`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, jrefEmbedded, { headers: { "content-type": testMediaType } });
      const subject = await get(`${testDomain}/main#/foo`);

      expect(subject.uri).to.equal(`${testDomain}/foo`);
    });

    it("referencing the main document from an embedded document", async () => {
      const jrefEmbedded = `{
        "$embedded": {
          "${testDomain}/foo": {
            "main": { "$href": "/main" }
          }
        }
      }`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, jrefEmbedded, { headers: { "content-type": testMediaType } });
      const main = await get(`${testDomain}/main`);
      const subject = await get("/foo#/main", main);

      expect(subject.uri).to.equal(`${testDomain}/main`);
    });

    it("referencing an embedded document from an embedded document", async () => {
      const jrefEmbedded = `{
        "$embedded": {
          "${testDomain}/foo": {
            "bar": { "$href": "/bar" }
          },
          "${testDomain}/bar": {}
        }
      }`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, jrefEmbedded, { headers: { "content-type": testMediaType } });
      const main = await get(`${testDomain}/main`);
      const subject = await get("/foo#/bar", main);

      expect(subject.uri).to.equal(`${testDomain}/bar`);
    });

    it("a cached document takes precence over an embedded document", async () => {
      const cachedJrefEmbedded = `{
        "foo": { "$href": "/main" }
      }`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/cached" })
        .reply(200, cachedJrefEmbedded, { headers: { "content-type": testMediaType } });
      const cached = await get(`${testDomain}/cached`);

      const jrefEmbedded = `{
        "main": { "$href": "/cached#/foo" },

        "$embedded": {
          "${testDomain}/cached": {
            "foo": { "$href": "/foo" }
          },
          "${testDomain}/foo": {}
        }
      }`;
      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, jrefEmbedded, { headers: { "content-type": testMediaType } });
      const main = await get(`${testDomain}/main`, cached);
      const subject = await get("/cached#/foo", main);

      expect(subject.uri).to.equal(`${testDomain}/main`);
    });
  });
});
