import { describe, test, expect } from "vitest";
import { Hyperjump, JrefMediaTypePlugin, JsonMediaTypePlugin, UnsupportedMediaTypeError } from "./index.js";
import { mediaTypeByExtension, mediaTypePluginFor } from "./media-type-plugins.js";
import { fromJs } from "../json/jsonast-util.js";

/**
 * @import { AbsoluteIri } from "@hyperjump/uri"
 * @import { DocumentNode, HyperjumpConfig, MediaTypePlugin, RetrievedResponse } from "./index.js"
 */

describe("JSON Browser", () => {
  describe("media types", () => {
    test("default", () => {
      expect(new Hyperjump().accept).to.equal("application/reference+json, application/json, */*; q=0.001");
    });

    describe("media type of a URL's extension", () => {
      const fooPlugin = {
        mediaType: "application/foo+json",
        extensions: [".foo.json"],
        parse: async () => ({ type: "foo-document", children: [fromJs(42)] })
      };

      test("by extension", () => {
        expect(extensionMediaType({ mediaTypePlugins: [fooPlugin] }, "test:/path/to/bar.json")).to.equal("application/json");
      });

      test("the longest matching extension wins", () => {
        expect(extensionMediaType({ mediaTypePlugins: [fooPlugin] }, "test:/path/to/bar.foo.json")).to.equal("application/foo+json");
      });

      test("an extension isn't a whole filename", () => {
        expect(extensionMediaType({ mediaTypePlugins: [fooPlugin] }, "test:/path/to/.foo.json")).to.equal("application/json");
      });

      test("without a matching extension, there isn't one", () => {
        expect(extensionMediaType({}, "test:/path/to/bar")).to.equal(undefined);
      });
    });

    describe("Accept header", () => {
      /** @type (quality?: number) => MediaTypePlugin<DocumentNode> */
      const fooPlugin = (quality) => ({
        mediaType: "application/foo",
        extensions: [".foo"],
        quality,
        parse: async () => ({ type: "foo-document", children: [] })
      });

      test("a configured media type comes after the defaults", () => {
        const { accept } = new Hyperjump({ mediaTypePlugins: [fooPlugin()] });
        expect(accept).to.equal("application/reference+json, application/json, application/foo, */*; q=0.001");
      });

      test("with a quality", () => {
        const { accept } = new Hyperjump({ mediaTypePlugins: [fooPlugin(0.8)] });
        expect(accept).to.equal("application/reference+json, application/json, application/foo; q=0.8, */*; q=0.001");
      });

      test("with a quality of 0", () => {
        const { accept } = new Hyperjump({ mediaTypePlugins: [fooPlugin(0)] });
        expect(accept).to.equal("application/reference+json, application/json, application/foo; q=0, */*; q=0.001");
      });

      test.each([
        [1.5],
        [-0.1],
        [0.0001],
        [Number.NaN],
        ["0.5"]
      ])("a quality of %s throws when it's configured", (quality) => {
        const plugin = { ...fooPlugin(), quality: /** @type number */ (quality) };
        expect(() => new Hyperjump({ mediaTypePlugins: [plugin] })).toThrow(RangeError);
      });

      test("changing a quality after it's configured doesn't change it", () => {
        const plugin = fooPlugin(0.8);
        const hyperjump = new Hyperjump({ mediaTypePlugins: [plugin] });
        plugin.quality = 0.1;

        expect(hyperjump.accept).to.equal("application/reference+json, application/json, application/foo; q=0.8, */*; q=0.001");
      });

      test("a default's quality is configured with a replacement", () => {
        const { accept } = new Hyperjump({ mediaTypePlugins: [new JsonMediaTypePlugin({ quality: 0.5 })] });
        expect(accept).to.equal("application/reference+json, application/json; q=0.5, */*; q=0.001");
      });

      test("a later plugin for a media type replaces an earlier one", () => {
        const { accept } = new Hyperjump({ mediaTypePlugins: [fooPlugin(0.8), fooPlugin(0.9)] });
        expect(accept).to.equal("application/reference+json, application/json, application/foo; q=0.9, */*; q=0.001");
      });
    });

    describe("Content-Type header", () => {
      test("with parameters", () => {
        expect(pluginMediaType({}, "application/json; charset=utf-8")).to.equal("application/json");
      });

      test("without one", () => {
        expect(() => pluginMediaType({}, null)).toThrow(UnsupportedMediaTypeError);
      });

      test.each([
        "not a media type",
        "application/json garbage",
        ";charset=utf-8"
      ])("an invalid Content-Type: '%s'", (contentType) => {
        expect(() => pluginMediaType({}, contentType)).toThrow(UnsupportedMediaTypeError);
      });

      test("an unsupported one", () => {
        expect(() => pluginMediaType({}, "text/plain")).toThrow(UnsupportedMediaTypeError);
      });
    });

    describe("Structured suffix media types", () => {
      test("should match structured suffix media type with concrete media type", () => {
        expect(pluginMediaType({}, "application/whatever+json")).to.equal("application/json");
      });

      test("a plugin for a structured suffix media type takes precedence over the suffix's plugin", () => {
        const plugin = {
          mediaType: "application/whatever+json",
          extensions: [],
          parse: async () => ({ type: "whatever-document", children: [fromJs(42)] })
        };

        expect(pluginMediaType({ mediaTypePlugins: [plugin] }, "application/whatever+json")).to.equal("application/whatever+json");
      });

      test("a replaced JRef plugin takes precedence over the JSON plugin", () => {
        const jref = new JrefMediaTypePlugin();
        const { mediaTypePlugins } = new Hyperjump({ mediaTypePlugins: [jref] });

        const [, plugin] = mediaTypePluginFor(mediaTypePlugins, "application/reference+json", /** @type AbsoluteIri */ ("test:/foo"));
        expect(plugin).to.equal(jref);
      });

      test("a wildcard plugin doesn't take precedence over a more specific plugin", () => {
        // The wildcard is configured first, so it would win a tie
        const config = {
          mediaTypePlugins: [
            {
              mediaType: "application/*",
              extensions: [],
              parse: async () => ({ type: "wildcard-document", children: [fromJs("wildcard")] })
            },
            {
              mediaType: "application/foo",
              extensions: [],
              parse: async () => ({ type: "foo-document", children: [fromJs("foo")] })
            }
          ]
        };

        expect(pluginMediaType(config, "application/foo")).to.equal("application/foo");
      });
    });

    describe("JRef plugin", () => {
      test("a document with an invalid reference can't be used", async () => {
        const response = new Response(`{ "$ref": "a b" }`);
        Object.defineProperty(response, "url", { value: "https://example.com/main.jref" });

        await expect(new JrefMediaTypePlugin().parse(/** @type RetrievedResponse */ (response))).rejects.toMatchObject({
          reason: "'a b' is not a valid reference",
          source: "jref",
          ruleId: "invalid-reference",
          fatal: true
        });
      });
    });
  });
});

/**
 * The media type of a URL's extension with this config's plugins
 *
 * @type (config: HyperjumpConfig, uri: string) => string | undefined
 */
const extensionMediaType = (config, uri) => {
  return mediaTypeByExtension(new Hyperjump(config).mediaTypePlugins, uri);
};

/**
 * The media type of the plugin that parses a response with this
 * `Content-Type`, with this config's plugins
 *
 * @type (config: HyperjumpConfig, contentType: string | null) => string
 */
const pluginMediaType = (config, contentType) => {
  const [mediaType] = mediaTypePluginFor(new Hyperjump(config).mediaTypePlugins, contentType, /** @type AbsoluteIri */ ("test:/foo"));
  return mediaType;
};
