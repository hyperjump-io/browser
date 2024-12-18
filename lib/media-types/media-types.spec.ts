import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { addMediaTypePlugin, removeMediaTypePlugin, setMediaTypeQuality } from "../index.js";
import { acceptableMediaTypes } from "./media-types.js";


describe("JSON Browser", () => {
  describe("media types", () => {
    test("default", () => {
      const accept = acceptableMediaTypes() as string;
      expect(accept).to.equal("application/reference+json, */*; q=0.001");
    });

    describe("media type plugin without quality", () => {
      beforeEach(() => {
        addMediaTypePlugin("application/foo", {
          parse: async () => { // eslint-disable-line @typescript-eslint/require-await
            return {
              baseUri: "https://example.com/foo",
              root: null,
              anchorLocation: (fragment) => fragment ?? ""
            };
          },
          fileMatcher: async (path) => path.endsWith(".foo") // eslint-disable-line @typescript-eslint/require-await
        });
      });

      afterEach(() => {
        removeMediaTypePlugin("application/foo");
      });

      test("addMediaTypePlugin", () => {
        const accept = acceptableMediaTypes() as string;
        expect(accept).to.equal("application/reference+json, application/foo, */*; q=0.001");
      });

      test("removeMediaTypePlugin", () => {
        removeMediaTypePlugin("application/foo");
        const accept = acceptableMediaTypes() as string;
        expect(accept).to.equal("application/reference+json, */*; q=0.001");
      });

      test("setMediaTypeQuality", () => {
        setMediaTypeQuality("application/foo", 0.9);
        const accept = acceptableMediaTypes() as string;
        expect(accept).to.equal("application/reference+json, application/foo; q=0.9, */*; q=0.001");
      });
    });

    describe("media type plugin with quality", () => {
      beforeEach(() => {
        addMediaTypePlugin("application/foo", {
          parse: async () => { // eslint-disable-line @typescript-eslint/require-await
            return {
              baseUri: "https://exmple.com/foo",
              root: null,
              anchorLocation: (fragment) => fragment ?? ""
            };
          },
          fileMatcher: async (path) => path.endsWith(".foo"), // eslint-disable-line @typescript-eslint/require-await
          quality: 0.8
        });
      });

      afterEach(() => {
        removeMediaTypePlugin("application/foo");
      });

      test("addMediaTypePlugin", () => {
        const accept = acceptableMediaTypes() as string;
        expect(accept).to.equal("application/reference+json, application/foo; q=0.8, */*; q=0.001");
      });

      test("setMediaTypeQuality", () => {
        setMediaTypeQuality("application/foo", 0.9);
        const accept = acceptableMediaTypes() as string;
        expect(accept).to.equal("application/reference+json, application/foo; q=0.9, */*; q=0.001");
      });
    });
  });
});
