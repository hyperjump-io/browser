import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump, JrefMediaTypePlugin } from "./index.js";
import { fromJs, toJson } from "../json/jsonast-util.js";

describe("JSON Browser", () => {
  describe("media types", () => {
    test("default", () => {
      const hyperjump = new Hyperjump();
      const accept = hyperjump.acceptableMediaTypes();
      expect(accept).to.equal("application/reference+json, application/json, */*; q=0.001");
    });

    describe("media type plugin without quality", () => {
      /** @type Hyperjump */
      let hyperjump;

      beforeEach(() => {
        hyperjump = new Hyperjump();

        hyperjump.addMediaTypePlugin({
          mediaType: "application/foo",
          extensions: [".foo"],
          parse: async () => {
            return {
              type: "foo-document",
              children: [],
              uri: "https://example.com/foo"
            };
          }
        });
      });

      afterEach(() => {
        hyperjump.removeMediaTypePlugin("application/foo");
      });

      test("addMediaTypePlugin", () => {
        const accept = hyperjump.acceptableMediaTypes();
        expect(accept).to.equal("application/reference+json, application/json, application/foo, */*; q=0.001");
      });

      test("removeMediaTypePlugin", () => {
        hyperjump.removeMediaTypePlugin("application/foo");
        const accept = hyperjump.acceptableMediaTypes();
        expect(accept).to.equal("application/reference+json, application/json, */*; q=0.001");
      });

      test("setMediaTypeQuality", () => {
        hyperjump.setMediaTypeQuality("application/foo", 0.9);
        const accept = hyperjump.acceptableMediaTypes();
        expect(accept).to.equal("application/reference+json, application/json, application/foo; q=0.9, */*; q=0.001");
      });
    });

    describe("media type plugin with quality", () => {
      /** @type Hyperjump */
      let hyperjump;

      beforeEach(() => {
        hyperjump = new Hyperjump();

        hyperjump.addMediaTypePlugin({
          mediaType: "application/foo",
          extensions: [".foo"],
          quality: 0.8,
          parse: async () => {
            return {
              type: "foo-document",
              children: [],
              uri: "https://exmple.com/foo"
            };
          }
        });
      });

      afterEach(() => {
        hyperjump.removeMediaTypePlugin("application/foo");
      });

      test("addMediaTypePlugin", () => {
        const accept = hyperjump.acceptableMediaTypes();
        expect(accept).to.equal("application/reference+json, application/json, application/foo; q=0.8, */*; q=0.001");
      });

      test("setMediaTypeQuality", () => {
        hyperjump.setMediaTypeQuality("application/foo", 0.9);
        const accept = hyperjump.acceptableMediaTypes();
        expect(accept).to.equal("application/reference+json, application/json, application/foo; q=0.9, */*; q=0.001");
      });
    });

    describe("Structured suffix media types", () => {
      const testDomain = "https://example.com";

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

      test("should match structured suffix media type with concrete media type", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `{}`, { headers: { "content-type": "application/whatever+json" } });

        const hyperjump = new Hyperjump();

        // Expect not to throw
        await hyperjump.get(`${testDomain}/foo`);
      });

      test("a plugin for a structured suffix media type takes precedence over the suffix's plugin", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `{}`, { headers: { "content-type": "application/whatever+json" } });

        const hyperjump = new Hyperjump();
        hyperjump.addMediaTypePlugin({
          mediaType: "application/whatever+json",
          extensions: [],
          parse: async () => ({ type: "whatever-document", children: [fromJs(42)] })
        });

        const subject = await hyperjump.get(`${testDomain}/foo`);
        expect(toJson(subject)).to.equal(`42`);
      });

      test("re-registered JRef plugin takes precedence over the JSON plugin", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `{ "$ref": "/bar" }`, { headers: { "content-type": "application/reference+json" } });
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/bar" })
          .reply(200, `42`, { headers: { "content-type": "application/reference+json" } });

        const hyperjump = new Hyperjump();
        hyperjump.removeMediaTypePlugin("application/reference+json");
        hyperjump.addMediaTypePlugin(new JrefMediaTypePlugin());

        const subject = await hyperjump.get(`${testDomain}/foo`);
        expect(toJson(subject)).to.equal(`42`);
      });

      test("a wildcard plugin doesn't take precedence over a more specific plugin", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `42`, { headers: { "content-type": "application/json" } });

        const hyperjump = new Hyperjump();
        hyperjump.removeMediaTypePlugin("application/json");
        hyperjump.addMediaTypePlugin({
          mediaType: "application/*",
          extensions: [],
          parse: async () => ({ type: "wildcard-document", children: [fromJs("wildcard")] })
        });
        hyperjump.addMediaTypePlugin({
          mediaType: "application/json",
          extensions: [],
          parse: async () => ({ type: "json-document", children: [fromJs("json")] })
        });

        const subject = await hyperjump.get(`${testDomain}/foo`);
        expect(toJson(subject)).to.equal(`"json"`);
      });
    });
  });
});
