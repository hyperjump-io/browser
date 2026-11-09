import { Readable } from "node:stream";
import { describe, test, expect } from "vitest";
import { HttpError, Hyperjump, RetrievalError } from "./index.js";
import { toJson } from "../json/jsonast-util.js";

/**
 * @import { UrlSchemePlugin } from "./index.js"
 */

describe("JSON Browser", () => {
  describe("URL schemes", () => {
    const fixtureDocument = `{"foo": 42}`;

    test("Error on unsupported scheme", async () => {
      const hyperjump = new Hyperjump({ allowRetrieval: ["foo:something"] });
      const session = hyperjump.session();
      try {
        await session.get("foo:something");
        expect.fail("Expected RetrievalError => UnsupportedUrlSchemeError");
      } catch (error) {
        expect(error).to.be.instanceof(RetrievalError);
        const retrievalError = /** @type RetrievalError */ (error);
        const cause = /** @type Error */ (retrievalError.cause);
        expect(cause.name).to.equal("UnsupportedUrlSchemeError");
      }
    });

    test("a scheme with the name of an object property isn't supported", async () => {
      const hyperjump = new Hyperjump({ allowRetrieval: ["constructor:something"] });
      const result = hyperjump.session().get("constructor:something");

      await expect(result).rejects.toBeInstanceOf(RetrievalError);
      await expect(result).rejects.toHaveProperty("cause", expect.objectContaining({ name: "UnsupportedUrlSchemeError" }));
    });

    test.each([
      ["a URL", "FOO:something", "foo"],
      ["a plugin", "foo:something", "FOO"]
    ])("a scheme in %s is case-insensitive", async (_name, url, scheme) => {
      const hyperjump = new Hyperjump({
        allowRetrieval: ["foo:something"],
        urlSchemePlugins: [{ ...fooPlugin(fixtureDocument), schemes: [scheme] }]
      });

      const subject = await hyperjump.session().get(url);
      expect(toJson(subject)).to.equal(`{"foo":42}`);
    });

    describe("Custom URL scheme plugin", () => {
      test("is configured", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something"],
          urlSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async ({ url }) => {
              const stream = new Readable();
              stream.push(fixtureDocument);
              stream.push(null);
              const webStream = /** @type ReadableStream<Uint8Array> */ (Readable.toWeb(stream));
              const response = new Response(webStream, {
                headers: { "Content-Type": "application/reference+json" }
              });
              Object.defineProperty(response, "url", { value: url });

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
          urlSchemePlugins: [fooPlugin(`{ "foo": 24 }`), fooPlugin(fixtureDocument)]
        });

        const subject = await hyperjump.session().get("foo:something");
        expect(toJson(subject)).to.equal(`{"foo":42}`);
      });

      test("replaces a default only for the schemes it lists", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["https://example.com/", "http://[::1]:1/"],
          urlSchemePlugins: [{
            schemes: ["https"],
            retrieve: async () => new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } })
          }]
        });

        const subject = await hyperjump.session().get("https://example.com/foo#/foo");
        expect(toJson(subject)).to.equal(`42`);
        await expect(hyperjump.session().get("http://[::1]:1/foo")).rejects.toHaveProperty("cause", expect.objectContaining({ name: "TypeError" }));
      });

      test("a request has the Accept header", async () => {
        /** @type string | undefined */
        let accept;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something"],
          urlSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async (request) => {
              accept = request.headers.get("accept") ?? undefined;
              return new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } });
            }
          }]
        });

        await hyperjump.session().get("foo:something");
        expect(accept).to.equal("application/reference+json, application/json, */*; q=0.001");
      });

      test("a response without a Content-Type doesn't get its extension's media type", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something.json"],
          urlSchemePlugins: [withoutContentType]
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
          urlSchemePlugins: [{
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

      test("a response without a URL gets the URL that was retrieved", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:something"],
          urlSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async () => new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } })
          }]
        });

        const document = await hyperjump.session().getDocument("foo:something#/foo");
        expect(document.url).to.equal("foo:something");
      });

      test.each([
        ["dot segments", "foo:/a/./b/../c", "foo:/a/c"],
        ["an uppercase scheme", "FOO:/a", "foo:/a"],
        ["Unicode", "foo:/résumé", "foo:/r%C3%A9sum%C3%A9"],
        ["a space", "foo:/a b", "foo:/a%20b"]
      ])("a URL with %s is retrieved parsed", async (_name, url, expected) => {
        /** @type string | undefined */
        let retrieved;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/"],
          urlSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async ({ url }) => {
              retrieved = url;
              return new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } });
            }
          }]
        });

        const document = await hyperjump.session().getDocument(url);
        expect(retrieved).to.equal(expected);
        expect(document.url).to.equal(expected);
      });
    });

    describe("redirects", () => {
      test("a redirect is retrieved with the plugin for its scheme", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo", "foo:something"],
          urlSchemePlugins: [fooPlugin(fixtureDocument), urnPlugin("foo:something")]
        });

        const subject = await hyperjump.session().get("urn:example:foo");
        expect(toJson(subject)).to.equal(`{"foo":42}`);
      });

      test("the document's URL is where the redirect led", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo", "foo:something"],
          urlSchemePlugins: [fooPlugin(fixtureDocument), urnPlugin("foo:something")]
        });

        const document = await hyperjump.session().getDocument("urn:example:foo");
        expect(document.url).to.equal("foo:something");
      });

      test("a Location that isn't a URL isn't followed", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/a"],
          urlSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async () => new Response(null, { status: 302, headers: { Location: "https://[" } })
          }]
        });

        const error = await hyperjump.session().get("foo:/a")
          .catch((/** @type unknown */ error) => error);
        expect(error).to.be.instanceof(RetrievalError);
        expect(/** @type RetrievalError */ (error).cause).to.be.instanceof(TypeError);
      });

      test("a response's URL is parsed", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/a", "foo:/a b"],
          urlSchemePlugins: [responseWithUrl("FOO:/a b")]
        });

        const document = await hyperjump.session().getDocument("foo:/a");
        expect(document.url).to.equal("foo:/a%20b");
      });

      test.each([
        ["isn't parsed", "FOO:/a b", "foo:/a%20b"],
        ["has a fragment", "foo:/b#c", "foo:/b"]
      ])("a response's URL that a plugin defined and %s is parsed", async (_name, url, expected) => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/"],
          urlSchemePlugins: [definedUrl(url)]
        });

        const document = await hyperjump.session().getDocument("foo:/a");
        expect(document.url).to.equal(expected);
      });

      test("a redirect whose URL a plugin defined and isn't parsed is followed", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/"],
          urlSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async ({ url }) => {
              const response = url === "foo:/a"
                ? new Response(null, { status: 302, headers: { location: "c" } })
                : new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } });
              Object.defineProperty(response, "url", { value: url === "foo:/a" ? "FOO:/a b/" : url });
              return response;
            }
          }]
        });

        const document = await hyperjump.session().getDocument("foo:/a");
        expect(document.url).to.equal("foo:/a%20b/c");
      });

      test("a response's URL with Unicode is encoded", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/a", "foo:/rosé"],
          urlSchemePlugins: [responseWithUrl("foo:/rosé")]
        });

        const document = await hyperjump.session().getDocument("foo:/a");
        expect(document.url).to.equal("foo:/ros%C3%A9");
      });

      test("a response's URL that isn't a URL fails the retrieval", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/a"],
          urlSchemePlugins: [responseWithUrl("not a URL")]
        });

        await expect(hyperjump.session().getDocument("foo:/a")).rejects.toBeInstanceOf(RetrievalError);
      });

      test("a redirect is retrieved with the same headers", async () => {
        /** @type string | undefined */
        let referencedFrom;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo", "foo:something"],
          urlSchemePlugins: [
            {
              schemes: ["foo"],
              retrieve: async (request) => {
                referencedFrom = request.headers.get("referer") ?? undefined;
                return new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } });
              }
            },
            urnPlugin("foo:something")
          ]
        });

        await hyperjump.session().get("urn:example:foo", { referencedFrom: "https://example.com/doc" });
        expect(referencedFrom).to.equal("https://example.com/doc");
      });

      test("a redirect to a URL that isn't allowed isn't retrieved", async () => {
        let retrieved = false;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo"],
          urlSchemePlugins: [
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

        const error = await refusal(hyperjump.session().get("urn:example:foo"));
        expect(error.response.url).to.equal("foo:something");
        expect(error.message).to.contain("Retrieving 'foo:something' isn't allowed");
        expect(retrieved).to.equal(false);
      });

      test("a redirect to an unsupported scheme throws", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["urn:example:foo", "bar:something"],
          urlSchemePlugins: [urnPlugin("bar:something")]
        });

        await expect(hyperjump.session().get("urn:example:foo")).rejects.toHaveProperty("cause", expect.objectContaining({ name: "UnsupportedUrlSchemeError" }));
      });

      test("a relative Location is resolved against the URL of the redirect", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/"],
          urlSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async ({ url }) => url === "foo:/a/b"
              ? new Response(null, { status: 302, headers: { location: "c" } })
              : new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } })
          }]
        });

        const document = await hyperjump.session().getDocument("foo:/a/b");
        expect(document.url).to.equal("foo:/a/c");
      });

      test("a redirect cycle fails", async () => {
        let retrievals = 0;
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/"],
          urlSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async ({ url }) => {
              retrievals++;
              return Response.redirect(url === "foo:/a" ? "foo:/b" : "foo:/a");
            }
          }]
        });

        await expect(hyperjump.session().get("foo:/a")).rejects.toHaveProperty("cause.message", expect.stringContaining("redirected more than 20 times"));
        expect(retrievals).to.equal(21);
      });

      test("a redirect status without a Location is an HttpError", async () => {
        const hyperjump = new Hyperjump({
          allowRetrieval: ["foo:/"],
          urlSchemePlugins: [{
            schemes: ["foo"],
            retrieve: async () => new Response(`42`, { status: 302, headers: { "Content-Type": "application/json" } })
          }]
        });

        const error = await hyperjump.session().get("foo:/a")
          .catch((/** @type unknown */ error) => error);
        expect(error).to.be.instanceOf(RetrievalError);
        expect(/** @type Error */ (error).cause).to.be.instanceOf(HttpError);
      });
    });
  });
});

/** @type (document: string) => UrlSchemePlugin */
const fooPlugin = (document) => ({
  schemes: ["foo"],
  retrieve: async ({ url }) => {
    const response = new Response(document, { headers: { "Content-Type": "application/reference+json" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  }
});

/**
 * A `urn:` plugin that redirects every URN to one URL
 *
 * @type (url: string) => UrlSchemePlugin
 */
const urnPlugin = (url) => ({
  schemes: ["urn"],
  retrieve: async () => Response.redirect(url)
});

/**
 * A `foo:` plugin whose responses have this URL, the way `fetch`'s do: from
 * the prototype, not set on the response
 *
 * @type (url: string) => UrlSchemePlugin
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
 * @type (url: string) => UrlSchemePlugin
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
 * @type UrlSchemePlugin
 */
const withoutContentType = {
  schemes: ["foo"],
  // A string body would get a `Content-Type`
  retrieve: async () => new Response(new TextEncoder().encode(`{ "foo": 42 }`))
};

/**
 * The `HttpError` for a refusal by `allowRetrieval`, which is the cause of
 * the `RetrievalError` a session gives
 *
 * @type (retrieval: Promise<unknown>) => Promise<HttpError>
 */
const refusal = async (retrieval) => {
  const error = await retrieval.then(() => {
    throw Error("Expected a refusal");
  }, (/** @type unknown */ error) => error);
  expect(error).to.be.instanceOf(RetrievalError);
  const cause = /** @type Error */ (error).cause;
  expect(cause).to.be.instanceOf(HttpError);
  expect(/** @type HttpError */ (cause).response.status).to.equal(403);
  return /** @type HttpError */ (cause);
};
