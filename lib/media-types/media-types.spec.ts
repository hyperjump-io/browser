import { describe, it, beforeEach, afterEach, expect } from "vitest";
import {
  addMediaTypePlugin,
  removeMediaTypePlugin,
  setMediaTypeQuality
} from "../index.js";
import { acceptableMediaTypes } from "./media-types.js";


describe("JSON Browser", () => {
  describe("media types", () => {
    it("default", () => {
      const accept = acceptableMediaTypes() as string;
      expect(accept).to.equal("application/reference+json, */*; q=0.001");
    });

    describe("media type plugin without quality", () => {
      beforeEach(() => {
        addMediaTypePlugin("application/foo", {
          parse: async () => {
            return {
              baseUri: "https://example.com/foo",
              cursor: "",
              root: null
            };
          },
          fileMatcher: async (path) => path.endsWith(".foo")
        });
      });

      afterEach(() => {
        removeMediaTypePlugin("application/foo");
      });

      it("addMediaTypePlugin", () => {
        const accept = acceptableMediaTypes() as string;
        expect(accept).to.equal("application/reference+json, application/foo, */*; q=0.001");
      });

      it("removeMediaTypePlugin", () => {
        removeMediaTypePlugin("application/foo");
        const accept = acceptableMediaTypes() as string;
        expect(accept).to.equal("application/reference+json, */*; q=0.001");
      });

      it("setMediaTypeQuality", () => {
        setMediaTypeQuality("application/foo", 0.9);
        const accept = acceptableMediaTypes() as string;
        expect(accept).to.equal("application/reference+json, application/foo; q=0.9, */*; q=0.001");
      });
    });

    describe("media type plugin with quality", () => {
      beforeEach(() => {
        addMediaTypePlugin("application/foo", {
          parse: async () => {
            return {
              baseUri: "https://exmple.com/foo",
              cursor: "",
              root: null
            };
          },
          fileMatcher: async (path) => path.endsWith(".foo"),
          quality: 0.8
        });
      });

      afterEach(() => {
        removeMediaTypePlugin("application/foo");
      });

      it("addMediaTypePlugin", () => {
        const accept = acceptableMediaTypes() as string;
        expect(accept).to.equal("application/reference+json, application/foo; q=0.8, */*; q=0.001");
      });

      it("setMediaTypeQuality", () => {
        setMediaTypeQuality("application/foo", 0.9);
        const accept = acceptableMediaTypes() as string;
        expect(accept).to.equal("application/reference+json, application/foo; q=0.9, */*; q=0.001");
      });
    });
  });
});
