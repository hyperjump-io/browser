import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { Hyperjump, RetrievalError } from "../index.js";
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
      });

      test("not found", async () => {
        const path = "/foo";

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(404, "");

        const hyperjump = new Hyperjump();
        try {
          await hyperjump.get(testDomain + path);
          expect.fail("Expected RetrievalError => HttpError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.name).to.equal("HttpError");
        }
      });

      test("no content type", async () => {
        const path = "/foo";

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(200);

        const hyperjump = new Hyperjump();
        try {
          await hyperjump.get(testDomain + path);
          expect.fail("Expected RetrievalError => UnknownMediaTypeError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.name).to.equal("UnknownMediaTypeError");
        }
      });

      test("unsupported content type", async () => {
        const path = "/foo";
        const yaml = `foo: 42`;
        const contentType = "application/yaml";

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(200, yaml, { headers: { "content-type": contentType } });

        const hyperjump = new Hyperjump();
        try {
          await hyperjump.get(testDomain + path);
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

          const hyperjump = new Hyperjump();
          const subject = await hyperjump.get(`${uri}#/foo`);

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

          const hyperjump = new Hyperjump();
          const subject = await hyperjump.get(`${uri}#/foo`);

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

        const hyperjump = new Hyperjump();
        try {
          await hyperjump.get(testDomain + path);
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

        const hyperjump = new Hyperjump();
        const subject = await hyperjump.get(`${uri}#/foo`);

        expect(toJson(subject)).to.equal(`42`);
      });

      // There isn't a way to make this pass in the browser do to limitations of the Fetch spec.
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

        const hyperjump = new Hyperjump();
        const subject = await hyperjump.get(uri);

        expect(toJson(subject)).to.equal(`42`);
      });

      // There isn't a way to make this pass in the browser do to limitations of the Fetch spec.
      test.skip("redirect whose inherited fragment gets overriden by the Location's fragment", async () => {
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

        const hyperjump = new Hyperjump();
        const subject = await hyperjump.get(`${uri}#/bar`);

        expect(toJson(subject)).to.equal(`42`);
      });

      [201, 202, 204, 205, 206, 300, 304].forEach((status) => {
        test(`${status}`, async () => {
          const path = "/foo";

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: path })
            .reply(status, "");

          const hyperjump = new Hyperjump();
          try {
            await hyperjump.get(testDomain + path);
            expect.fail("Expected RetrievalError => HttpError");
          } catch (error) {
            expect(error).to.be.instanceof(RetrievalError);
            const retrievalError = /** @type RetrievalError */ (error);
            const cause = /** @type Error */ (retrievalError.cause);
            expect(cause.name).to.include("HttpError");
          }
        });
      });
    });
  });
});
