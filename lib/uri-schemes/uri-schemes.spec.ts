import { Readable } from "node:stream";
import { expect } from "chai";
import { Response } from "undici";
import { addUriSchemePlugin, removeUriSchemePlugin, UnsupportedUriSchemeError, get } from "../index.js";


describe("JSON Browser", () => {
  describe("URI schemes", () => {
    const fixtureDocument = `{"foo": 42}`;

    it("Error on unsupported scheme", async () => {
      try {
        await get("foo:something");
        expect.fail("Expected UnsupportedUriSchemeError");
      } catch (error: unknown) {
        expect(error).to.be.instanceof(UnsupportedUriSchemeError);
        expect((error as UnsupportedUriSchemeError).scheme).to.equal("foo");
      }
    });

    describe("Custom URI scheme plugin", () => {
      beforeEach(() => {
        addUriSchemePlugin("foo", {
          retrieve: async (uri) => {
            const stream = new Readable();
            stream.push(fixtureDocument);
            stream.push(null);
            const response = new Response(stream, {
              headers: { "Content-Type": "application/reference+json" }
            });
            Object.defineProperty(response, "url", { value: uri });

            return { response, fragment: "" };
          }
        });
      });

      afterEach(() => {
        removeUriSchemePlugin("application/foo");
      });

      it("addUriSchemePlugin", async () => {
        await get("foo:something");
      });

      it("removeUriSchemePlugin", async () => {
        removeUriSchemePlugin("foo");

        try {
          await get("foo:something");
          expect.fail("Expected UnsupportedUriSchemeError");
        } catch (error: unknown) {
          expect(error).to.be.instanceof(UnsupportedUriSchemeError);
          expect((error as UnsupportedUriSchemeError).scheme).to.equal("foo");
        }
      });
    });
  });
});