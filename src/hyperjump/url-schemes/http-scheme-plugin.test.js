import { describe, test, beforeEach, afterEach, expect, vi } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump, HttpError, HttpUrlSchemePlugin, MemoryHttpCacheStore, RetrievalError } from "../index.js";
import { toJson } from "../../json/jsonast-util.js";

/**
 * @import { HyperjumpConfig } from "../hyperjump.d.ts"
 * @import { HttpUrlSchemePluginOptions } from "./http-scheme-plugin.d.ts"
 */

describe("JSON Browser", () => {
  describe("get", () => {
    describe("`http(s):` scheme", () => {
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
        vi.unstubAllGlobals();
      });

      test("not found", async () => {
        const path = "/foo";

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(404, "");

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const session = hyperjump.session();
        try {
          await session.get(testDomain + path);
          expect.fail("Expected RetrievalError => HttpError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          expect(retrievalError.cause).to.be.instanceof(HttpError);
          const cause = /** @type HttpError */ (retrievalError.cause);
          expect(cause.response.status).to.equal(404);
        }
      });

      test("no content type", async () => {
        const path = "/foo";

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(200);

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const session = hyperjump.session();
        try {
          await session.get(testDomain + path);
          expect.fail("Expected RetrievalError => UnsupportedMediaTypeError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.name).to.equal("UnsupportedMediaTypeError");
        }
      });

      test("a redirect to a refused URL without a content type is refused", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(302, "", { headers: { location: "https://internal.example.com/foo" } });
        mockAgent.get("https://internal.example.com")
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `{ "foo": 42 }`);

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const error = await refusal(hyperjump.session().get(`${testDomain}/foo`));
        expect(error.response.url).to.equal("https://internal.example.com/foo");
      });

      test.each([
        ["with a cache", new MemoryHttpCacheStore()],
        ["without a cache", /** @type const */ (false)]
      ])("a redirect to a refused URL isn't requested, %s", async (_name, cache) => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(302, "", { headers: { location: "https://internal.example.com/foo" } });
        mockAgent.get("https://internal.example.com")
          .intercept({ method: "GET", path: "/foo" })
          .reply(200, `{ "foo": 42 }`, { headers: { "content-type": "application/json" } });

        const hyperjump = new Hyperjump({
          allowRetrieval: ["https://example.com/"],
          urlSchemePlugins: [new HttpUrlSchemePlugin({ cache })]
        });
        await refusal(hyperjump.session().get(`${testDomain}/foo`));
        expect(mockAgent.pendingInterceptors()).to.have.length(1);
      });

      test("a redirect to a URL that isn't http(s): is refused", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(302, "", { headers: { location: "file:///etc/foo.json" } });

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/", "file:///etc/"] });
        const error = await hyperjump.session().get(`${testDomain}/foo`)
          .catch((/** @type unknown */ error) => error);
        expect(error).to.be.instanceof(RetrievalError);
        const cause = /** @type HttpError */ (/** @type RetrievalError */ (error).cause);
        expect(cause).to.be.instanceof(HttpError);
        expect(cause.message).to.contain("isn't an 'http:' or 'https:' URL");
      });

      test("a relative Location is resolved against the URL that was redirected", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo/bar" })
          .reply(302, "", { headers: { location: "baz" } });
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo/baz" })
          .reply(200, `42`, { headers: { "content-type": "application/json" } });

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const subject = await hyperjump.session().get(`${testDomain}/foo/bar`);
        expect(toJson(subject)).to.equal(`42`);
      });

      test("a permanent redirect is cached", async () => {
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/foo" })
          .reply(301, "", { headers: { "location": "/bar", "cache-control": "max-age=3600" } });
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: "/bar" })
          .reply(200, `42`, { headers: { "content-type": "application/json", "cache-control": "max-age=3600" } });

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        await hyperjump.session().get(`${testDomain}/foo`);
        // Each interceptor replies once, so another request would fail
        const subject = await hyperjump.session().get(`${testDomain}/foo`);
        expect(toJson(subject)).to.equal(`42`);
      });

      describe.each([
        ["with a cache", new MemoryHttpCacheStore()],
        ["without a cache", /** @type const */ (false)]
      ])("a response that isn't used has its body cancelled, %s", (_name, cache) => {
        // 202 is a success that isn't supported
        test.each([404, 202])("%i", async (status) => {
          let cancelled = false;
          vi.stubGlobal("fetch", async () => {
            const body = new ReadableStream({
              pull: (controller) => {
                controller.enqueue(new TextEncoder().encode("{}"));
              },
              cancel: () => {
                cancelled = true;
              }
            });
            return new Response(body, { status, headers: { "content-type": "application/json" } });
          });

          const hyperjump = new Hyperjump({
            allowRetrieval: ["https://example.com/"],
            urlSchemePlugins: [new HttpUrlSchemePlugin({ cache })]
          });
          await expect(hyperjump.session().get(`${testDomain}/foo`)).rejects.toBeInstanceOf(RetrievalError);
          expect(cancelled).to.equal(true);
        });
      });

      test("unsupported content type", async () => {
        const path = "/foo";
        const yaml = `foo: 42`;
        const contentType = "application/yaml";

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(200, yaml, { headers: { "content-type": contentType } });

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const session = hyperjump.session();
        try {
          await session.get(testDomain + path);
          expect.fail("Expected RetrievalError => UnsupportedMediaTypeError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.name).to.equal("UnsupportedMediaTypeError");
        }
      });

      [200, 203].forEach((status) => {
        test(`${status}`, async () => {
          const path = "/foo";
          const url = `${testDomain}${path}`;
          const jref = `{ "foo": 42 }`;

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: path })
            .reply(status, jref, { headers: { "content-type": "application/reference+json" } });

          const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
          const session = hyperjump.session();
          const subject = await session.get(`${url}#/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });
      });

      [301, 302, 303, 307, 308].forEach((status) => {
        test(`${status}`, async () => {
          const path = "/foo";
          const url = `${testDomain}${path}`;
          const redirectPath = "/alternate-foo";
          const jref = `{ "foo": 42 }`;

          const location = testDomain + redirectPath;
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: path })
            .reply(status, jref, { headers: { location: location } });

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: redirectPath })
            .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

          const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
          const session = hyperjump.session();
          const subject = await session.get(`${url}#/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });
      });

      test("redirect without a Location", async () => {
        const path = "/foo";
        const href = "/bar";
        const jref = `{
  "foo": 42,
  "bar": { "$ref": "${href}" }
}`;

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(307, jref);

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const session = hyperjump.session();
        try {
          await session.get(testDomain + path);
          expect.fail("Expected RetrievalError => HttpError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.name).to.equal("HttpError");
        }
      });

      test("Redirect that inherits a fragment", async () => {
        const path = "/foo";
        const url = `${testDomain}${path}`;
        const redirectPath = "/alternate-foo";
        const jref = `{ "foo": 42 }`;

        const location = `${testDomain}${redirectPath}`;
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(307, jref, { headers: { location: location } });

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: redirectPath })
          .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const session = hyperjump.session();
        const subject = await session.get(`${url}#/foo`);

        expect(toJson(subject)).to.equal(`42`);
      });

      test("redirected document with a reference to itself", async () => {
        const path = "/foo";
        const redirectPath = "/alternate-foo";
        const jref = `{
  "foo": { "$ref": "#/bar" },
  "bar": 42
}`;

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(307, "", { headers: { location: `${testDomain}${redirectPath}` } });

        // Only one request to the redirect target is expected
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: redirectPath })
          .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const session = hyperjump.session();
        const subject = await session.get(`${testDomain}${path}#/foo`);

        expect(toJson(subject)).to.equal(`42`);
      });

      // There isn't a way to make this pass in the browser due to limitations of the Fetch spec.
      test.skip("redirect with a Location that includes a fragment", async () => {
        const path = "/foo";
        const url = `${testDomain}${path}`;
        const redirectPath = "/alternate-foo";
        const jref = `{ "foo": 42 }`;

        const location = `${testDomain}${redirectPath}`;
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(307, jref, { headers: { location: `${location}#/foo` } });

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: redirectPath })
          .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const session = hyperjump.session();
        const subject = await session.get(url);

        expect(toJson(subject)).to.equal(`42`);
      });

      // There isn't a way to make this pass in the browser due to limitations of the Fetch spec.
      test.skip("redirect whose inherited fragment gets overridden by the Location's fragment", async () => {
        const path = "/foo";
        const url = `${testDomain}${path}`;
        const redirectPath = "/alternate-foo";
        const jref = `{
  "foo": 42,
  "bar": null
}`;

        const location = `${testDomain}${redirectPath}`;
        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(307, jref, { headers: { location: `${location}#/foo` } });

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: redirectPath })
          .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

        const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
        const session = hyperjump.session();
        const subject = await session.get(`${url}#/bar`);

        expect(toJson(subject)).to.equal(`42`);
      });

      [201, 202, 204, 205, 206, 300, 304].forEach((status) => {
        test(`${status}`, async () => {
          const path = "/foo";

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: path })
            .reply(status, "");

          const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
          const session = hyperjump.session();
          try {
            await session.get(testDomain + path);
            expect.fail("Expected RetrievalError => HttpError");
          } catch (error) {
            expect(error).to.be.instanceof(RetrievalError);
            const retrievalError = /** @type RetrievalError */ (error);
            const cause = /** @type Error */ (retrievalError.cause);
            expect(cause.name).to.include("HttpError");
          }
        });
      });

      describe("headers", () => {
        const contentType = { "content-type": "application/reference+json" };

        /** @type (options: Pick<HyperjumpConfig, "headers"> & HttpUrlSchemePluginOptions) => Hyperjump */
        const withOptions = ({ headers, ...options }) => {
          return new Hyperjump({
            allowRetrieval: ["https://example.com/", "https://other.example.com/"],
            urlSchemePlugins: [new HttpUrlSchemePlugin(options)],
            headers
          });
        };

        test("are sent to a URL under one that ends with a slash", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo/bar", headers: { authorization: "Bearer token" } })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({ headers: { "https://example.com/foo/": { Authorization: "Bearer token" } } });
          const subject = await hyperjump.session().get(`${testDomain}/foo/bar`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("are sent with a cache", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: { authorization: "Bearer token" } })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({
            cache: new MemoryHttpCacheStore(),
            headers: { "https://example.com/": { Authorization: "Bearer token" } }
          });
          const subject = await hyperjump.session().get(`${testDomain}/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("are sent without a cache", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: { authorization: "Bearer token" } })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({
            cache: false,
            headers: { "https://example.com/": { Authorization: "Bearer token" } }
          });
          const subject = await hyperjump.session().get(`${testDomain}/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("aren't sent to a URL that isn't listed", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: { authorization: "Bearer token" } })
            .reply(200, `{ "$ref": "https://other.example.com/bar" }`, { headers: contentType });
          mockAgent.get("https://other.example.com")
            .intercept({ method: "GET", path: "/bar", headers: (headers) => !("authorization" in headers) })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({ headers: { "https://example.com/": { Authorization: "Bearer token" } } });
          const subject = await hyperjump.session().get(`${testDomain}/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("for a URL that doesn't end with a slash are sent only to it", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: { authorization: "Bearer token" } })
            .reply(200, `{ "$ref": "/foo/bar" }`, { headers: contentType });
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo/bar", headers: (headers) => !("authorization" in headers) })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({ headers: { "https://example.com/foo": { Authorization: "Bearer token" } } });
          const subject = await hyperjump.session().get(`${testDomain}/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("for an origin without a slash are sent to everything on it", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo/bar", headers: { authorization: "Bearer token" } })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({ headers: { "https://example.com": { Authorization: "Bearer token" } } });
          const subject = await hyperjump.session().get(`${testDomain}/foo/bar`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("are compared after the URL is parsed", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: { authorization: "Bearer token" } })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({ headers: { "HTTPS://EXAMPLE.COM:443/bar/../#frag": { Authorization: "Bearer token" } } });
          const subject = await hyperjump.session().get(`${testDomain}/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("are merged, and a longer URL's win", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/v2/foo", headers: { "authorization": "Bearer 2", "x-client": "test" } })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({
            headers: {
              "https://example.com/v2/": { Authorization: "Bearer 2" },
              "https://example.com/": { "Authorization": "Bearer 1", "X-Client": "test" }
            }
          });
          const subject = await hyperjump.session().get(`${testDomain}/v2/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test.each([
          ["with", new MemoryHttpCacheStore()],
          ["without", /** @type const */ (false)]
        ])("aren't sent to where a redirect leads %s a cache", async (_name, cache) => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: { authorization: "Bearer token" } })
            .reply(302, "", { headers: { location: "https://other.example.com/bar" } });
          mockAgent.get("https://other.example.com")
            .intercept({ method: "GET", path: "/bar", headers: (headers) => !("authorization" in headers) && !("x-token" in headers) })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({
            cache,
            headers: { "https://example.com/": { "Authorization": "Bearer token", "X-Token": "token" } }
          });
          const subject = await hyperjump.session().get(`${testDomain}/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("where a redirect leads gets its own", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: { "x-token": "a" } })
            .reply(302, "", { headers: { location: "https://other.example.com/bar" } });
          mockAgent.get("https://other.example.com")
            .intercept({ method: "GET", path: "/bar", headers: { "x-token": "b" } })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({
            headers: {
              "https://example.com/": { "X-Token": "a" },
              "https://other.example.com/": { "X-Token": "b" }
            }
          });
          const subject = await hyperjump.session().get(`${testDomain}/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("can be a function of the URL", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: { authorization: "Bearer /foo" } })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({
            headers: { "https://example.com/": (url) => ({ Authorization: `Bearer ${url.pathname}` }) }
          });
          const subject = await hyperjump.session().get(`${testDomain}/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test.each([
          ["with", new MemoryHttpCacheStore()],
          ["without", /** @type const */ (false)]
        ])("a function gets the URL without its fragment %s a cache", async (_name, cache) => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo" })
            .reply(200, `{ "bar": 42 }`, { headers: contentType });

          /** @type string | undefined */
          let href;
          const hyperjump = withOptions({
            cache,
            headers: {
              "https://example.com/": (url) => {
                href = url.href;
                return {};
              }
            }
          });
          await hyperjump.session().get(`${testDomain}/foo#/bar`);

          expect(href).to.equal(`${testDomain}/foo`);
        });

        test("can be an async function", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: { authorization: "Bearer token" } })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({
            headers: { "https://example.com/": async () => new Headers({ Authorization: "Bearer token" }) }
          });
          const subject = await hyperjump.session().get(`${testDomain}/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("can be a function that returns nothing", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: (headers) => !("authorization" in headers) })
            .reply(200, `42`, { headers: contentType });

          const hyperjump = withOptions({ headers: { "https://example.com/": () => undefined } });
          const subject = await hyperjump.session().get(`${testDomain}/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });

        test("a relative URL throws", () => {
          expect(() => new Hyperjump({ headers: { "/foo/": {} } })).to.throw("'/foo/' in the 'headers' config isn't an absolute URL");
        });

        test("Referer isn't sent", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: (headers) => !("referer" in headers) })
            .reply(200, `42`, { headers: contentType });

          const session = withOptions({}).session();
          const subject = await session.get(`${testDomain}/foo`, { referencedFrom: "file:///home/me/a.json" });

          expect(toJson(subject)).to.equal(`42`);
        });

        test("can't replace Accept", async () => {
          const hyperjump = withOptions({
            headers: { "https://example.com/": { Accept: "text/plain" } }
          });

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo", headers: { accept: "application/reference+json, application/json, */*; q=0.001" } })
            .reply(200, `42`, { headers: contentType });

          const subject = await hyperjump.session().get(`${testDomain}/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });
      });

      describe("the mediaTypeByExtension config", () => {
        /** @type (cache: MemoryHttpCacheStore | false, mediaTypeByExtension: string[]) => Hyperjump */
        const withOptions = (cache, mediaTypeByExtension) => {
          return new Hyperjump({
            allowRetrieval: ["https://example.com/", "https://other.example.com/"],
            urlSchemePlugins: [new HttpUrlSchemePlugin({ cache })],
            mediaTypeByExtension
          });
        };

        /** @type (hyperjump: Hyperjump, url: string) => Promise<string | undefined> */
        const unsupportedMediaType = async (hyperjump, url) => {
          const error = await hyperjump.session().get(url)
            .then(() => undefined, (/** @type unknown */ error) => error);
          expect(error).to.be.instanceof(RetrievalError);
          const cause = /** @type Error & { mediaType?: string } */ (/** @type RetrievalError */ (error).cause);
          expect(cause.name).to.equal("UnsupportedMediaTypeError");
          return cause.mediaType;
        };

        describe.each([
          ["with a cache", () => new MemoryHttpCacheStore()],
          ["without a cache", () => /** @type const */ (false)]
        ])("%s", (_name, cache) => {
          test("replaces a wrong Content-Type", async () => {
            mockAgent.get(testDomain)
              .intercept({ method: "GET", path: "/foo.json" })
              .reply(200, `{ "foo": 42 }`, { headers: { "content-type": "text/plain" } });

            const hyperjump = withOptions(cache(), ["https://example.com/"]);
            const subject = await hyperjump.session().get(`${testDomain}/foo.json`);

            expect(toJson(subject)).to.eql(`{"foo":42}`);
          });

          test("gives a response without a Content-Type one", async () => {
            mockAgent.get(testDomain)
              .intercept({ method: "GET", path: "/foo.json" })
              .reply(200, `{ "foo": 42 }`);

            const hyperjump = withOptions(cache(), ["https://example.com/"]);
            const subject = await hyperjump.session().get(`${testDomain}/foo.json`);

            expect(toJson(subject)).to.eql(`{"foo":42}`);
          });

          test("isn't used for a URL that isn't listed", async () => {
            mockAgent.get(testDomain)
              .intercept({ method: "GET", path: "/foo.json" })
              .reply(200, `{ "foo": 42 }`, { headers: { "content-type": "text/plain" } });

            const hyperjump = withOptions(cache(), ["https://other.example.com/"]);

            expect(await unsupportedMediaType(hyperjump, `${testDomain}/foo.json`)).to.equal("text/plain");
          });

          test("keeps the server's Content-Type for an extension no plugin has", async () => {
            mockAgent.get(testDomain)
              .intercept({ method: "GET", path: "/foo.txt" })
              .reply(200, `{ "foo": 42 }`, { headers: { "content-type": "application/json" } });

            const hyperjump = withOptions(cache(), ["https://example.com/"]);
            const subject = await hyperjump.session().get(`${testDomain}/foo.txt`);

            expect(toJson(subject)).to.eql(`{"foo":42}`);
          });

          test("without a Content-Type or an extension a plugin has, can't be parsed", async () => {
            mockAgent.get(testDomain)
              .intercept({ method: "GET", path: "/foo.txt" })
              .reply(200, `{ "foo": 42 }`);

            const hyperjump = withOptions(cache(), ["https://example.com/"]);

            expect(await unsupportedMediaType(hyperjump, `${testDomain}/foo.txt`)).to.equal(undefined);
          });

          test("is matched by the URL a response was redirected to", async () => {
            mockAgent.get(testDomain)
              .intercept({ method: "GET", path: "/foo" })
              .reply(302, "", { headers: { location: "https://other.example.com/foo.json" } });
            mockAgent.get("https://other.example.com")
              .intercept({ method: "GET", path: "/foo.json" })
              .reply(200, `{ "foo": 42 }`, { headers: { "content-type": "text/plain" } });

            const hyperjump = withOptions(cache(), ["https://other.example.com/"]);
            const subject = await hyperjump.session().get(`${testDomain}/foo`);

            expect(toJson(subject)).to.eql(`{"foo":42}`);
          });

          test("uses the extension of the path, without the query", async () => {
            mockAgent.get(testDomain)
              .intercept({ method: "GET", path: "/foo.json?token=abc" })
              .reply(200, `{ "foo": 42 }`, { headers: { "content-type": "text/plain" } });

            const hyperjump = withOptions(cache(), ["https://example.com/"]);
            const subject = await hyperjump.session().get(`${testDomain}/foo.json?token=abc`);

            expect(toJson(subject)).to.eql(`{"foo":42}`);
          });
        });

        test("doesn't change what's cached", async () => {
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: "/foo.json" })
            .reply(200, `{ "foo": 42 }`, { headers: { "content-type": "text/plain", "cache-control": "max-age=60" } });

          const cache = new MemoryHttpCacheStore();
          const hyperjump = withOptions(cache, ["https://example.com/"]);
          const subject = await hyperjump.session().get(`${testDomain}/foo.json`);
          expect(toJson(subject)).to.eql(`{"foo":42}`);

          expect(await unsupportedMediaType(withOptions(cache, []), `${testDomain}/foo.json`)).to.equal("text/plain");
        });

        test("a relative URL throws", () => {
          expect(() => new Hyperjump({ mediaTypeByExtension: ["/foo/"] })).to.throw("'/foo/' in the 'mediaTypeByExtension' config isn't an absolute URL");
        });
      });
    });
  });
});

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
