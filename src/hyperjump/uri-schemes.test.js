import { Readable } from "node:stream";
import { describe, test, expect } from "vitest";
import { InvalidIriError } from "@hyperjump/uri";
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

    test("a scheme with the name of an object property isn't supported", async () => {
      const hyperjump = new Hyperjump({ allowRetrieval: ["constructor:something"] });
      const result = hyperjump.session().get("constructor:something");

      await expect(result).rejects.toBeInstanceOf(RetrievalError);
      await expect(result).rejects.toHaveProperty("cause", expect.objectContaining({ name: "UnsupportedUriSchemeError" }));
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

      test("a plugin is given the media type of a URL's extension", async () => {
        /** @type string | undefined */
        let mediaType;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something"],
          uriSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async (_uri, options) => {
              mediaType = options.mediaTypeByExtension("foo:something.json");
              return new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } });
            }
          }]
        });

        await hyperjump.session().get("foo:something");
        expect(mediaType).to.equal("application/json");
      });

      test("a response without a Content-Type doesn't get its extension's media type", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something.json"],
          uriSchemePlugins: [withoutContentType]
        });

        const result = hyperjump.session().get("foo:something.json");
        await expect(result).rejects.toBeInstanceOf(RetrievalError);
        await expect(result).rejects.toHaveProperty("cause", expect.objectContaining({ name: "UnsupportedMediaTypeError" }));
      });

      test.each([
        ["no Content-Type", undefined],
        ["an unsupported Content-Type", "application/foo"]
      ])("a response with %s has its body cancelled", async (_name, contentType) => {
        let cancelled = false;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something"],
          uriSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async () => {
              const body = new ReadableStream({
                cancel: () => {
                  cancelled = true;
                }
              });
              return new Response(body, contentType ? { headers: { "Content-Type": contentType } } : {});
            }
          }]
        });

        await expect(hyperjump.session().get("foo:something")).rejects.toBeInstanceOf(RetrievalError);
        expect(cancelled).to.equal(true);
      });

      test("a response without a URL gets the URI that was retrieved", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something"],
          uriSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async () => new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } })
          }]
        });

        const document = await hyperjump.session().getDocument("foo:something#/foo");
        expect(document.uri).to.equal("foo:something");
      });
    });

    describe("redirects", () => {
      test("a redirect is retrieved with the plugin for its scheme", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo", "foo:something"],
          uriSchemePlugins: [fooPlugin(fixtureDocument), urnPlugin("foo:something")]
        });

        const subject = await hyperjump.session().get("urn:example:foo");
        expect(toJson(subject)).to.equal(`{"foo":42}`);
      });

      test("the document's URL is where the redirect led", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo", "foo:something"],
          uriSchemePlugins: [fooPlugin(fixtureDocument), urnPlugin("foo:something")]
        });

        const document = await hyperjump.session().getDocument("urn:example:foo");
        expect(document.uri).to.equal("foo:something");
      });

      test("a Location that isn't an IRI-reference isn't followed", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/a", "foo:/a b"],
          uriSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async () => new Response(null, { status: 302, headers: { Location: "a b" } })
          }]
        });

        // A scheme that isn't built in, so resolving doesn't check the result
        const error = await hyperjump.session().get("foo:/a")
          .catch((/** @type unknown */ error) => error);
        expect(error).to.be.instanceof(RetrievalError);
        expect(/** @type RetrievalError */ (error).cause).to.be.instanceof(InvalidIriError);
      });

      test("a response's URL that isn't an IRI is made one", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/a", "foo:/a%7Cb"],
          uriSchemePlugins: [responseWithUrl("foo:/a|b")]
        });

        const document = await hyperjump.session().getDocument("foo:/a");
        expect(document.uri).to.equal("foo:/a%7Cb");
      });

      test.each([
        ["isn't an IRI", "foo:/a|b", "foo:/a%7Cb"],
        ["has a fragment", "foo:/b#c", "foo:/b"]
      ])("a response's URL that a plugin defined and %s is made one", async (_name, url, expected) => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/"],
          uriSchemePlugins: [definedUrl(url)]
        });

        const document = await hyperjump.session().getDocument("foo:/a");
        expect(document.uri).to.equal(expected);
      });

      test("a redirect whose URL a plugin defined and isn't an IRI is followed", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/"],
          uriSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async (uri) => {
              const response = uri === "foo:/a"
                ? new Response(null, { status: 302, headers: { location: "c" } })
                : new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } });
              Object.defineProperty(response, "url", { value: uri === "foo:/a" ? "foo:/a|b/" : uri });
              return response;
            }
          }]
        });

        const document = await hyperjump.session().getDocument("foo:/a");
        expect(document.uri).to.equal("foo:/a%7Cb/c");
      });

      test("a response's URL that's an IRI is kept as it is", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/a", "foo:/rosé"],
          uriSchemePlugins: [responseWithUrl("foo:/rosé")]
        });

        const document = await hyperjump.session().getDocument("foo:/a");
        expect(document.uri).to.equal("foo:/rosé");
      });

      test("a response's URL that isn't a URL fails the retrieval", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/a"],
          uriSchemePlugins: [responseWithUrl("not a URL")]
        });

        await expect(hyperjump.session().getDocument("foo:/a")).rejects.toBeInstanceOf(RetrievalError);
      });

      test("a redirect is retrieved with the same options", async () => {
        /** @type string | undefined */
        let referencedFrom;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo", "foo:something"],
          uriSchemePlugins: [
            {
              schemes: ["foo"],
              retrieve: async (_uri, options) => {
                referencedFrom = options.referencedFrom;
                return new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } });
              }
            },
            urnPlugin("foo:something")
          ]
        });

        await hyperjump.session().get("urn:example:foo", { referencedFrom: "https://example.com/doc" });
        expect(referencedFrom).to.equal("https://example.com/doc");
      });

      test("a redirect to a URI that isn't allowed isn't retrieved", async () => {
        let retrieved = false;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo"],
          uriSchemePlugins: [
            {
              schemes: ["foo"],
              retrieve: async () => {
                retrieved = true;
                return new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } });
              }
            },
            urnPlugin("foo:something")
          ]
        });

        const error = await hyperjump.session().get("urn:example:foo")
          .catch((/** @type unknown */ error) => error);
        expect(error).to.be.instanceof(RetrievalNotAllowedError);
        expect(/** @type RetrievalNotAllowedError */ (error).uri).to.equal("foo:something");
        expect(/** @type RetrievalNotAllowedError */ (error).message).to.contain("led to 'foo:something'");
        expect(retrieved).to.equal(false);
      });

      test("a redirect to an unsupported scheme throws", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo", "bar:something"],
          uriSchemePlugins: [urnPlugin("bar:something")]
        });

        await expect(hyperjump.session().get("urn:example:foo")).rejects.toHaveProperty("cause", expect.objectContaining({ name: "UnsupportedUriSchemeError" }));
      });

      test("a relative Location is resolved against the URL of the redirect", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/"],
          uriSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async (uri) => uri === "foo:/a/b"
              ? new Response(null, { status: 302, headers: { location: "c" } })
              : new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } })
          }]
        });

        const document = await hyperjump.session().getDocument("foo:/a/b");
        expect(document.uri).to.equal("foo:/a/c");
      });

      test("a redirect cycle fails", async () => {
        let retrievals = 0;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/"],
          uriSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async (uri) => {
              retrievals++;
              return Response.redirect(uri === "foo:/a" ? "foo:/b" : "foo:/a");
            }
          }]
        });

        await expect(hyperjump.session().get("foo:/a")).rejects.toHaveProperty("cause.message", expect.stringContaining("redirected more than 20 times"));
        expect(retrievals).to.equal(21);
      });

      test("a redirect status without a Location is a response", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/"],
          uriSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async () => new Response(`42`, { status: 302, headers: { "Content-Type": "application/json" } })
          }]
        });

        const subject = await hyperjump.session().get("foo:/a");
        expect(toJson(subject)).to.equal(`42`);
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
 * A `urn:` plugin that redirects every URN to one URI
 *
 * @type (uri: string) => UriSchemePlugin
 */
const urnPlugin = (uri) => ({
  schemes: ["urn"],
  retrieve: async () => Response.redirect(uri)
});

/**
 * A `foo:` plugin whose responses have this URL, the way `fetch`'s do: from
 * the prototype, not set on the response
 *
 * @type (url: string) => UriSchemePlugin
 */
const responseWithUrl = (url) => ({
  schemes: ["foo"],
  retrieve: async () => {
    const response = new Response(`{"foo": 42}`, { headers: { "Content-Type": "application/reference+json" } });
    return Object.setPrototypeOf(response, Object.create(Response.prototype, {
      url: { get: () => url }
    }));
  }
});

/**
 * A `foo:` plugin that defines its responses' URL as this one, which makes it
 * read-only
 *
 * @type (url: string) => UriSchemePlugin
 */
const definedUrl = (url) => ({
  schemes: ["foo"],
  retrieve: async () => {
    const response = new Response(`{"foo": 42}`, { headers: { "Content-Type": "application/reference+json" } });
    Object.defineProperty(response, "url", { value: url });
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
