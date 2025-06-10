import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { addUriSchemePlugin, removeUriSchemePlugin, get, RetrievalError } from "../index.js";


describe("JSON Browser", () => {
  describe("URI schemes", () => {
    const fixtureDocument = `{"foo": 42}`;

    test("Error on unsupported scheme", async () => {
      try {
        await get("foo:something");
        expect.fail("Expected RetrievalError => UnsupportedUriSchemeError");
      } catch (error: unknown) {
        expect(error).to.be.instanceof(RetrievalError);
        expect((error as RetrievalError).cause.name).to.equal("UnsupportedUriSchemeError");
      }
    });

    describe("Custom URI scheme plugin", () => {
      beforeEach(() => {
        addUriSchemePlugin("foo", {
          retrieve: async (uri) => { // eslint-disable-line @typescript-eslint/require-await
            const response = new Response(fixtureDocument, {
              headers: { "Content-Type": "application/reference+json" }
            });
            Object.defineProperty(response, "url", { value: uri });

            return response;
          }
        });
      });

      afterEach(() => {
        removeUriSchemePlugin("application/foo");
      });

      test("addUriSchemePlugin", async () => {
        await get("foo:something");
      });

      test("removeUriSchemePlugin", async () => {
        removeUriSchemePlugin("foo");

        try {
          await get("foo:something");
          expect.fail("Expected RetrievalError => UnsupportedUriSchemeError");
        } catch (error: unknown) {
          expect(error).to.be.instanceof(RetrievalError);
          expect((error as RetrievalError).cause.name).to.equal("UnsupportedUriSchemeError");
        }
      });
    });
  });
});
