import { expect } from "chai";
import { MockAgent, setGlobalDispatcher } from "undici";
import { get, HttpError, UnsupportedMediaTypeError, UnknownMediaTypeError } from "./index.js";
import { Reference } from "./jref/index.js";


describe("JSON Browser", () => {
  describe("get", () => {
    describe("http", () => {
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
          expect.fail("Exception HttpError");
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

      it("jref", async () => {
        const path = "/foo";
        const href = "/bar";
        const jref = `{
  "foo": 42,
  "bar": { "$href": "${href}" }
}`;

        mockAgent.get(testDomain)
          .intercept({ method: "GET", path: path })
          .reply(200, jref, { headers: { "content-type": "application/reference+json" } });

        const uri = testDomain + path;
        const document = await get(uri);

        expect(document).to.eql({
          uri: uri,
          document: { value: { foo: 42, bar: new Reference(href) } }
        });
      });
    });
  });
});
