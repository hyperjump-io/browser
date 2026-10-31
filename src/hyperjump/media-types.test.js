import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump, JrefMediaTypePlugin, JsonMediaTypePlugin, RetrievalError, UnsupportedMediaTypeError } from "./index.js";
import { fromJs, toJson } from "../json/jsonast-util.js";

/**
 * @import { DocumentNode, HyperjumpConfig, MediaTypePlugin } from "./index.js"
 */

describe("JSON Browser", () => {
  describe("media types", () => {
    test("default", async () => {
      const accept = await acceptFor({});
      expect(accept).to.equal("application/reference+json, application/json, */*; q=0.001");
    });

    describe("media type of a URL's extension", () => {
      const fooPlugin = {
        mediaType: "application/foo+json",
        extensions: [".foo.json"],
        parse: async () => ({ type: "foo-document", children: [fromJs(42)] })
      };

      test("by extension", async () => {
        expect(await mediaTypeFor({ mediaTypePlugins: [fooPlugin] }, "test:/path/to/bar.json")).to.equal("application/json");
      });

      test("the longest matching extension wins", async () => {
        expect(await mediaTypeFor({ mediaTypePlugins: [fooPlugin] }, "test:/path/to/bar.foo.json")).to.equal("application/foo+json");
      });

      test("an extension isn't a whole filename", async () => {
        expect(await mediaTypeFor({ mediaTypePlugins: [fooPlugin] }, "test:/path/to/.foo.json")).to.equal("application/json");
      });

      test("without a matching extension, it can't be determined", async () => {
        const result = mediaTypeFor({}, "test:/path/to/bar");

        await expect(result).rejects.toBeInstanceOf(RetrievalError);
        await expect(result).rejects.toHaveProperty("cause", expect.any(UnsupportedMediaTypeError));
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

      test("a configured media type comes after the defaults", async () => {
        const accept = await acceptFor({ mediaTypePlugins: [fooPlugin()] });
        expect(accept).to.equal("application/reference+json, application/json, application/foo, */*; q=0.001");
      });

      test("with a quality", async () => {
        const accept = await acceptFor({ mediaTypePlugins: [fooPlugin(0.8)] });
        expect(accept).to.equal("application/reference+json, application/json, application/foo; q=0.8, */*; q=0.001");
      });

      test("with a quality of 0", async () => {
        const accept = await acceptFor({ mediaTypePlugins: [fooPlugin(0)] });
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

      test("changing a quality after it's configured doesn't change it", async () => {
        const plugin = fooPlugin(0.8);
        /** @type string | undefined */
        let accept;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["test:/"],
          mediaTypePlugins: [plugin],
          uriSchemePlugins: [{
            schemes: ["test"],
            retrieve: async (_uri, options) => {
              accept = options.accept;
              return new Response(`42`, { headers: { "Content-Type": "application/json" } });
            }
          }]
        });
        plugin.quality = 0.1;
        await hyperjump.session().get("test:/document");

        expect(accept).to.equal("application/reference+json, application/json, application/foo; q=0.8, */*; q=0.001");
      });

      test("a default's quality is configured with a replacement", async () => {
        const accept = await acceptFor({ mediaTypePlugins: [new JsonMediaTypePlugin({ quality: 0.5 })] });
        expect(accept).to.equal("application/reference+json, application/json; q=0.5, */*; q=0.001");
      });

      test("a later plugin for a media type replaces an earlier one", async () => {
        const accept = await acceptFor({ mediaTypePlugins: [fooPlugin(0.8), fooPlugin(0.9)] });
        expect(accept).to.equal("application/reference+json, application/json, application/foo; q=0.9, */*; q=0.001");
      });
    });

    describe("Content-Type header", () => {
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

      test("with parameters", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `42`, { headers: { "content-type": "application/json; charset=utf-8" } });

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const session = hyperjump.session();
        const subject = await session.get(`${testDomain}/foo`);

        expect(toJson(subject)).to.equal("42");
      });

      test.each([
        "not a media type",
        "application/json garbage",
        ";charset=utf-8"
      ])("an invalid Content-Type: '%s'", async (contentType) => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `42`, { headers: { "content-type": contentType } });

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const session = hyperjump.session();
        const result = session.get(`${testDomain}/foo`);

        await expect(result).rejects.toBeInstanceOf(RetrievalError);
        await expect(result).rejects.toHaveProperty("cause", expect.any(UnsupportedMediaTypeError));
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

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const session = hyperjump.session();

        // Expect not to throw
        await session.get(`${testDomain}/foo`);
      });

      test("a plugin for a structured suffix media type takes precedence over the suffix's plugin", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `{}`, { headers: { "content-type": "application/whatever+json" } });

        const hyperjump = new Hyperjump({
          allowRetrieval: ["https://example.com/"],
          mediaTypePlugins: [{
            mediaType: "application/whatever+json",
            extensions: [],
            parse: async () => ({ type: "whatever-document", children: [fromJs(42)] })
          }]
        });
        const session = hyperjump.session();

        const subject = await session.get(`${testDomain}/foo`);
        expect(toJson(subject)).to.equal(`42`);
      });

      test("a replaced JRef plugin takes precedence over the JSON plugin", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `{ "$ref": "/bar" }`, { headers: { "content-type": "application/reference+json" } });
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/bar" })
          .reply(200, `42`, { headers: { "content-type": "application/reference+json" } });

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"], mediaTypePlugins: [new JrefMediaTypePlugin()] });
        const session = hyperjump.session();

        const subject = await session.get(`${testDomain}/foo`);
        expect(toJson(subject)).to.equal(`42`);
      });

      test("a wildcard plugin doesn't take precedence over a more specific plugin", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `42`, { headers: { "content-type": "application/foo" } });

        // The wildcard is configured first, so it would win a tie
        const hyperjump = new Hyperjump({
          allowRetrieval: ["https://example.com/"],
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
        });
        const session = hyperjump.session();

        const subject = await session.get(`${testDomain}/foo`);
        expect(toJson(subject)).to.equal(`"foo"`);
      });
    });
  });
});

/**
 * The Accept header a `Hyperjump` with this config gives a URI scheme plugin
 *
 * @type (config: HyperjumpConfig) => Promise<string>
 */
const acceptFor = async (config) => {
  /** @type string | undefined */
  let accept;
  const hyperjump = new Hyperjump({
    ...config,
    allowRetrieval: ["test:/"],
    uriSchemePlugins: [{
      schemes: ["test"],
      retrieve: async (_uri, options) => {
        accept = options.accept;
        return new Response(`42`, { headers: { "Content-Type": "application/json" } });
      }
    }]
  });
  await hyperjump.session().get("test:/document");

  return /** @type string */ (accept);
};

/**
 * The media type of a document from a plugin that uses its URL's extension,
 * like the `file:` plugin, with this config
 *
 * @type (config: HyperjumpConfig, uri: string) => Promise<string | undefined>
 */
const mediaTypeFor = async (config, uri) => {
  const hyperjump = new Hyperjump({
    ...config,
    allowRetrieval: ["test:/"],
    uriSchemePlugins: [{
      schemes: ["test"],
      retrieve: async (uri, options) => {
        const headers = new Headers();
        const mediaType = options.mediaTypeByExtension(uri);
        if (mediaType !== undefined) {
          headers.set("content-type", mediaType);
        }
        // A string body would get a `Content-Type`
        return new Response(new TextEncoder().encode(`42`), { headers });
      }
    }]
  });
  const document = await hyperjump.session().getDocument(uri);

  return document.mediaType;
};
