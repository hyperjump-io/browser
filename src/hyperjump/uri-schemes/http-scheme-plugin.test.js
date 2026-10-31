import { describe, test, beforeEach, afterEach, expect, vi } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump, HttpError, HttpUriSchemePlugin, MemoryHttpCacheStore, RetrievalError, RetrievalNotAllowedError } from "../index.js";
import { toJson } from "../../json/jsonast-util.js";

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
          expect.fail("Expected RetrievalError => UnknownMediaTypeError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.name).to.equal("UnknownMediaTypeError");
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
        const error = await hyperjump.session().get(`${testDomain}/foo`)
          .catch((/** @type unknown */ error) => error);
        expect(error).to.be.instanceof(RetrievalNotAllowedError);
        expect(/** @type RetrievalNotAllowedError */ (error).uri).to.equal("https://internal.example.com/foo");
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
            uriSchemePlugins: [new HttpUriSchemePlugin({ cache })]
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
          const uri = `${testDomain}${path}`;
          const jref = `{ "foo": 42 }`;

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: path })
            .reply(status, jref, { headers: { "content-type": "application/reference+json" } });

          const hyperjump = new Hyperjump({ allowRetrieval: ["https://example.com/"] });
          const session = hyperjump.session();
          const subject = await session.get(`${uri}#/foo`);

          expect(toJson(subject)).to.equal(`42`);
        });
      });

      [301, 302, 303, 307, 308].forEach((status) => {
        test(`${status}`, async () => {
          const path = "/foo";
          const uri = `${testDomain}${path}`;
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
          const subject = await session.get(`${uri}#/foo`);

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
        const uri = `${testDomain}${path}`;
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
        const subject = await session.get(`${uri}#/foo`);

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
        const uri = `${testDomain}${path}`;
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
        const subject = await session.get(uri);

        expect(toJson(subject)).to.equal(`42`);
      });

      // There isn't a way to make this pass in the browser due to limitations of the Fetch spec.
      test.skip("redirect whose inherited fragment gets overridden by the Location's fragment", async () => {
        const path = "/foo";
        const uri = `${testDomain}${path}`;
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
        const subject = await session.get(`${uri}#/bar`);

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

        /** @type (options: import("./http-scheme-plugin.d.ts").HttpUriSchemePluginOptions) => Hyperjump */
        const withOptions = (options) => {
          return new Hyperjump({
            allowRetrieval: ["https://example.com/", "https://other.example.com/"],
            uriSchemePlugins: [new HttpUriSchemePlugin(options)]
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
          expect(() => new HttpUriSchemePlugin({ headers: { "/foo/": {} } })).to.throw("isn't an absolute URL");
        });

        test("a URL that isn't http(s): throws", () => {
          expect(() => new HttpUriSchemePlugin({ headers: { "file:///foo/": {} } })).to.throw("isn't an 'http:' or 'https:' URL");
        });

        test("a function for every URL throws", () => {
          /** @type unknown */
          const headersFunction = () => ({});
          const headers = /** @type Record<string, HeadersInit> */ (headersFunction);
          expect(() => new HttpUriSchemePlugin({ headers })).to.throw("must be an object");
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
    });
  });
});
