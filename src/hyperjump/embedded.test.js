import { describe, test, beforeEach, afterEach, expect, beforeAll, afterAll } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { toAbsoluteIri } from "@hyperjump/uri";
import { Hyperjump } from "./index.js";
import { fromJref } from "../jref/index.js";
import { toJson } from "../json/jsonast-util.js";

/**
 * @import { JrefJrefNode } from "../jref/jref-ast.js"
 */


describe("JSON Browser", () => {
  describe("embedded", () => {
    const hyperjump = new Hyperjump();
    const testDomain = "https://test.hyperjump.io";
    const testMediaType = "application/prs.hyperjump-embedded-test";

    beforeAll(() => {
      /**
       * @typedef {{
       *   type: "embedded-document";
       *   children: JrefJrefNode[];
       *   uri: string;
       *   fragmentKind: "json-pointer";
       *   embedded?: Record<string, EmbeddedDocumentNode>;
       * }} EmbeddedDocumentNode
       */

      /** @type (uri: string, text: string, embedded?: Record<string, EmbeddedDocumentNode>) => EmbeddedDocumentNode */
      const parseToDocument = (uri, text, embedded = {}) => {
        /** @type EmbeddedDocumentNode */
        const embeddedDocument = {
          type: "embedded-document",
          children: [],
          uri: uri,
          fragmentKind: "json-pointer",
          embedded: embedded
        };

        const rootNode = fromJref(text, uri, (node, key) => {
          if (key === "$embedded" && node.jsonType === "object") {
            for (const propertyNode of node.children) {
              const embeddedUri = toAbsoluteIri(propertyNode.children[0].value);
              const embeddedJref = toJson(propertyNode.children[1]);
              embedded[embeddedUri] = parseToDocument(embeddedUri, embeddedJref, embedded);
            }
            return;
          } else {
            return node;
          }
        });

        if (rootNode) {
          embeddedDocument.children.push(rootNode);
        }

        return embeddedDocument;
      };
      hyperjump.addMediaTypePlugin({
        mediaType: testMediaType,
        extensions: [".embedded"],
        parse: async (response) => parseToDocument(response.url, await response.text())
      });
    });

    afterAll(() => {
      hyperjump.removeMediaTypePlugin(testMediaType);
    });

    /** @type MockAgent */
    let mockAgent;

    beforeEach(() => {
      mockAgent = new MockAgent();
      mockAgent.disableNetConnect();
      setGlobalDispatcher(mockAgent);
    });

    afterEach(async () => {
      await mockAgent.close();
    });

    test("getting an embedded document", async () => {
      const jrefEmbedded = `{
        "foo": { "$ref": "/foo" },
        "$embedded": {
          "${testDomain}/foo": 42
        }
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, jrefEmbedded, { headers: { "content-type": testMediaType } });

      const uri = `${testDomain}/main#/foo`;
      const subject = await hyperjump.get(uri);

      expect(toJson(subject)).to.equal(`42`);
    });

    test("getting the main document from an embedded document", async () => {
      const jrefEmbedded = `{
        "foo": { "$ref": "/foo" },
        "bar": 42,
        "$embedded": {
          "${testDomain}/foo": { "$ref": "/main#/bar" }
        }
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, jrefEmbedded, { headers: { "content-type": testMediaType } });

      const uri = `${testDomain}/main#/foo`;
      const subject = await hyperjump.get(uri);

      expect(toJson(subject)).to.equal(`42`);
    });

    test("getting an embedded document from an embedded document", async () => {
      const jrefEmbedded = `{
        "foo": { "$ref": "/foo" },
        "$embedded": {
          "${testDomain}/foo": { "$ref": "/bar" },
          "${testDomain}/bar": 42
        }
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, jrefEmbedded, { headers: { "content-type": testMediaType } });

      const uri = `${testDomain}/main#/foo`;
      const subject = await hyperjump.get(uri);

      expect(toJson(subject)).to.equal(`42`);
    });

    test("a cached document takes precence over an embedded document", async () => {
      const mainJref = `{
        "foo": { "$ref": "/external#/foo" },
        "bar": 42
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/main" })
        .reply(200, mainJref, { headers: { "content-type": testMediaType } });

      const externalJref = `{
        "foo": { "$ref": "/main#/bar" },
        "$embedded": {
          "${testDomain}/main": {
            "bar": null
          }
        }
      }`;

      mockAgent.get(testDomain)
        .intercept({ method: "GET", path: "/external" })
        .reply(200, externalJref, { headers: { "content-type": testMediaType } });

      const uri = `${testDomain}/main#/foo`;
      const subject = await hyperjump.get(uri);

      expect(toJson(subject)).to.equal(`42`);
    });
  });
});
