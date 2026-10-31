import { Readable } from "node:stream";
import { describe, test, expect } from "vitest";
import { Hyperjump, RetrievalError, RetrievalNotAllowedError } from "./index.js";
import { toJson } from "../json/jsonast-util.js";

/**
 * @import { UriSchemePlugin } from "./index.js"
 */

describe("JSON Browser", () => {
  describe("URI schemes", () => {
    const fixtureDocument = `{"foo": 42}`;

    test("Error on unsupported scheme", async () => {
      const hyperjump = new Hyperjump({ allowRetrieval: ["foo:something"] });
      const session = hyperjump.session();
      try {
        await session.get("foo:something");
        expect.fail("Expected RetrievalError => UnsupportedUriSchemeError");
      } catch (error) {
        expect(error).to.be.instanceof(RetrievalError);
        const retrievalError = /** @type RetrievalError */ (error);
        const cause = /** @type Error */ (retrievalError.cause);
        expect(cause.name).to.equal("UnsupportedUriSchemeError");
      }
    });

    describe("Custom URI scheme plugin", () => {
      test("is configured", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something"],
          uriSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async (uri) => {
              const stream = new Readable();
              stream.push(fixtureDocument);
              stream.push(null);
              const webStream = /** @type ReadableStream<Uint8Array> */ (Readable.toWeb(stream));
              const response = new Response(webStream, {
                headers: { "Content-Type": "application/reference+json" }
              });
              Object.defineProperty(response, "url", { value: uri });

              return response;
            }
          }]
        });

        const subject = await hyperjump.session().get("foo:something");
        expect(toJson(subject)).to.equal(`{"foo":42}`);
      });

      test("a later plugin for a scheme replaces an earlier one", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something"],
          uriSchemePlugins: [fooPlugin(`{ "foo": 24 }`), fooPlugin(fixtureDocument)]
        });

        const subject = await hyperjump.session().get("foo:something");
        expect(toJson(subject)).to.equal(`{"foo":42}`);
      });

      test("replaces a default only for the schemes it lists", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["https://example.com/", "http://[::1]:1/"],
          uriSchemePlugins: [{
            schemes: ["https"],
            retrieve: async () => new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } })
          }]
        });

        const subject = await hyperjump.session().get("https://example.com/foo#/foo");
        expect(toJson(subject)).to.equal(`42`);
        await expect(hyperjump.session().get("http://[::1]:1/foo")).rejects.toHaveProperty("cause", expect.objectContaining({ name: "TypeError" }));
      });

      test("a plugin is given the Accept header", async () => {
        /** @type string | undefined */
        let accept;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something"],
          uriSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async (_uri, options) => {
              accept = options.accept;
              return new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } });
            }
          }]
        });

        await hyperjump.session().get("foo:something");
        expect(accept).to.equal("application/reference+json, application/json, */*; q=0.001");
      });

      test("a response without a Content-Type has its extension's media type", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something.json"],
          uriSchemePlugins: [withoutContentType]
        });

        const document = await hyperjump.session().getDocument("foo:something.json");
        expect(document.mediaType).to.equal("application/json");
        expect(document.uri).to.equal(undefined);
      });
    });

    describe("options.retrieve", () => {
      test("retrieves another URI with the plugin for its scheme", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo", "foo:something"],
          uriSchemePlugins: [
            fooPlugin(fixtureDocument),
            {
              schemes: ["urn"],
              retrieve: async (_urn, options) => options.retrieve("foo:something", options)
            }
          ]
        });

        const subject = await hyperjump.session().get("urn:example:foo");
        expect(toJson(subject)).to.equal(`{"foo":42}`);
      });

      test("gives the other plugin the Accept header", async () => {
        /** @type string | undefined */
        let accept;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo", "foo:something"],
          uriSchemePlugins: [
            {
              schemes: ["foo"],
              retrieve: async (_uri, options) => {
                accept = options.accept;
                return new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } });
              }
            },
            {
              schemes: ["urn"],
              retrieve: async (_urn, options) => options.retrieve("foo:something")
            }
          ]
        });

        await hyperjump.session().get("urn:example:foo");
        expect(accept).to.equal("application/reference+json, application/json, */*; q=0.001");
      });

      test("gives a response without a Content-Type its extension's media type", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo", "foo:something.json"],
          uriSchemePlugins: [
            withoutContentType,
            {
              schemes: ["urn"],
              retrieve: async (_urn, options) => options.retrieve("foo:something.json", options)
            }
          ]
        });

        const document = await hyperjump.session().getDocument("urn:example:foo");
        expect(document.mediaType).to.equal("application/json");
      });

      test("a response from a URI that isn't allowed isn't used", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo"],
          uriSchemePlugins: [
            withoutContentType,
            {
              schemes: ["urn"],
              retrieve: async (_urn, options) => options.retrieve("foo:something.json", options)
            }
          ]
        });

        await expect(hyperjump.session().get("urn:example:foo")).rejects.toBeInstanceOf(RetrievalNotAllowedError);
      });

      test("an unsupported scheme throws", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo"],
          uriSchemePlugins: [{
            schemes: ["urn"],
            retrieve: async (_urn, options) => options.retrieve("bar:something", options)
          }]
        });

        await expect(hyperjump.session().get("urn:example:foo")).rejects.toHaveProperty("cause", expect.objectContaining({ name: "UnsupportedUriSchemeError" }));
      });
    });
  });
});

/** @type (document: string) => UriSchemePlugin */
const fooPlugin = (document) => ({
  schemes: ["foo"],
  retrieve: async (uri) => {
    const response = new Response(document, { headers: { "Content-Type": "application/reference+json" } });
    Object.defineProperty(response, "url", { value: uri });
    return response;
  }
});

/**
 * A `foo:` plugin whose responses don't have a `Content-Type` or a URL
 *
 * @type UriSchemePlugin
 */
const withoutContentType = {
  schemes: ["foo"],
  // A string body would get a `Content-Type`
  retrieve: async () => new Response(new TextEncoder().encode(`{ "foo": 42 }`))
};
