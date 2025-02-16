import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump } from "./index.js";


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

        hyperjump.addMediaTypePlugin("application/foo", {
          parse: async () => { // eslint-disable-line @typescript-eslint/require-await
            return {
              type: "foo-document",
              children: [],
              uri: "https://example.com/foo"
            };
          },
          uriMatcher: async (uri) => uri.endsWith(".foo") // eslint-disable-line @typescript-eslint/require-await
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

        hyperjump.addMediaTypePlugin("application/foo", {
          parse: async () => { // eslint-disable-line @typescript-eslint/require-await
            return {
              type: "foo-document",
              children: [],
              uri: "https://exmple.com/foo"
            };
          },
          uriMatcher: async (uri) => uri.endsWith(".foo"), // eslint-disable-line @typescript-eslint/require-await
          quality: 0.8
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
    });
  });
});
