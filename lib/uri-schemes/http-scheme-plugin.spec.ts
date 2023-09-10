import { expect } from "chai";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, HttpError, UnsupportedMediaTypeError, UnknownMediaTypeError } from "../index.js";
import { Reference } from "../jref/index.js";


describe("JSON Browser", () => {
  describe("get", () => {
    describe("`http(s):` scheme", () => {
      const testDomain = "https://example.com";
      let mockAgent: MockAgent;

      beforeEach(() => {
        mockAgent = new MockAgent();
        mockAgent.disableNetConnect();
        setGlobalDispatcher(mockAgent);
      });

      afterEach(async () => {
        await mockAgent.close();
      });

      it("not found", async () => {
        const path = "/foo";

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(404, "");

        try {
          await get(testDomain + path);
          expect.fail("Expected HttpError");
        } catch (error: unknown) {
          expect(error).to.be.instanceof(HttpError);
          expect((error as HttpError).response.status).to.equal(404);
        }
      });

      it("no content type", async () => {
        const path = "/foo";

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(200);

        try {
          await get(testDomain + path);
          expect.fail("Expected UnknownMediaTypeError");
        } catch (error: unknown) {
          expect(error).to.be.instanceof(UnknownMediaTypeError);
        }
      });

      it("unsupported content type", async () => {
        const path = "/foo";
        const yaml = `foo: 42`;
        const contentType = "application/yaml";

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(200, yaml, { headers: { "content-type": contentType } });

        try {
          await get(testDomain + path);
          expect.fail("Expected UnsupportedMediaTypeError");
        } catch (error: unknown) {
          expect(error).to.be.instanceof(UnsupportedMediaTypeError);
        }
      });

      [200, 203].forEach((status) => {
        it(`${status}`, async () => {
          const path = "/foo";
          const fragment = "/foo";
          const href = "/bar";
          const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: path })
            .reply(status, jref, { headers: { "content-type": "application/reference+json" } });

          const browser = await get(`${testDomain}${path}#${fragment}`);

          expect(browser.baseUri).to.equal(testDomain + path);
          expect(browser.cursor).to.equal(fragment);
          expect(browser.root).to.eql({ foo: 42, bar: new Reference(href) });
        });
      });

      [301, 302, 303, 307, 308].forEach((status) => {
        it(`${status}`, async () => {
          const path = "/foo";
          const redirectPath = "/alternate-foo";
          const href = "/bar";
          const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

          const location = testDomain + redirectPath;
          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: path })
            .reply(status, jref, { headers: { location: location } });

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: redirectPath })
            .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

          const browser = await get(testDomain + path);

          expect(browser.baseUri).to.equal(location);
          expect(browser.cursor).to.equal("");
          expect(browser.root).to.eql({ foo: 42, bar: new Reference(href) });
        });
      });

      it("redirect without a Location", async () => {
        const path = "/foo";
        const href = "/bar";
        const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(307, jref);

        try {
          await get(testDomain + path);
          expect.fail("Expected HttpError");
        } catch (error: unknown) {
          expect(error).to.be.instanceof(HttpError);
        }
      });

      it("Redirect that inherits a fragment", async () => {
        const path = "/foo";
        const fragment = "/foo";
        const redirectPath = "/alternate-foo";
        const href = "/bar";
        const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(307, jref, { headers: { location: testDomain + redirectPath } });

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: redirectPath })
          .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

        const browser = await get(`${testDomain}${path}#${fragment}`);

        expect(browser.baseUri).to.equal(testDomain + redirectPath);
        expect(browser.cursor).to.equal(fragment);
        expect(browser.root).to.eql({ foo: 42, bar: new Reference(href) });
      });

      it("redirect with a Location that includes a fragment", async () => {
        const path = "/foo";
        const redirectPath = "/alternate-foo";
        const redirectFragment = "/main";
        const href = "/bar";
        const jref = `{
"main": {
    "foo": 42,
    "bar": { "$href": "${href}" }
  }
}`;

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(307, jref, { headers: { location: `${testDomain}${redirectPath}#${redirectFragment}` } });

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: redirectPath })
          .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

        const browser = await get(`${testDomain}${path}`);

        expect(browser.baseUri).to.equal(testDomain + redirectPath);
        expect(browser.cursor).to.equal(redirectFragment);
        expect(browser.root).to.eql({
          main: { foo: 42, bar: new Reference(href) }
        });
      });

      it("redirect whose inherited fragment gets overriden by the Location's fragment", async () => {
        const path = "/foo";
        const fragment = "/root";
        const redirectPath = "/alternate-foo";
        const redirectFragment = "/main";
        const href = "/bar";
        const jref = `{
"main": {
    "foo": 42,
    "bar": { "$href": "${href}" }
  }
}`;

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(307, jref, { headers: { location: `${testDomain}${redirectPath}#${redirectFragment}` } });

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: redirectPath })
          .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

        const browser = await get(`${testDomain}${path}#${fragment}`);

        expect(browser.baseUri).to.equal(testDomain + redirectPath);
        expect(browser.cursor).to.equal(redirectFragment);
        expect(browser.root).to.eql({
          main: { foo: 42, bar: new Reference(href) }
        });
      });

      [201, 202, 204, 205, 206, 300, 304].forEach((status) => {
        it(`${status}`, async () => {
          const path = "/foo";

          mockAgent.get(testDomain)
            .intercept({ method: "GET", path: path })
            .reply(status, "");

          try {
            await get(testDomain + path);
            expect.fail("Expected HttpError");
          } catch (error: unknown) {
            expect(error).to.be.instanceof(HttpError);
          }
        });
      });
    });
  });
});
