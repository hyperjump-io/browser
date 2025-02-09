import { Readable } from "node:stream";
import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { Hyperjump, RetrievalError } from "./index.js";


describe("JSON Browser", () => {
  describe("URI schemes", () => {
    const fixtureDocument = `{"foo": 42}`;

    test("Error on unsupported scheme", async () => {
      const hyperjump = new Hyperjump();
      try {
        await hyperjump.get("foo:something");
        expect.fail("Expected RetrievalError => UnsupportedUriSchemeError");
      } catch (error) {
        expect(error).to.be.instanceof(RetrievalError);
        const retrievalError = /** @type RetrievalError */ (error);
        const cause = /** @type Error */ (retrievalError.cause);
        expect(cause.name).to.equal("UnsupportedUriSchemeError");
      }
    });

    describe("Custom URI scheme plugin", () => {
      /** @type Hyperjump */
      let hyperjump;

      beforeEach(() => {
        hyperjump = new Hyperjump();

        hyperjump.addUriSchemePlugin("foo", {
          retrieve: async (uri) => { // eslint-disable-line @typescript-eslint/require-await
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
        });
      });

      afterEach(() => {
        hyperjump.removeUriSchemePlugin("application/foo");
      });

      test("addUriSchemePlugin", async () => {
        await hyperjump.get("foo:something");
      });

      test("removeUriSchemePlugin", async () => {
        hyperjump.removeUriSchemePlugin("foo");

        try {
          await hyperjump.get("foo:something");
          expect.fail("Expected RetrievalError => UnsupportedUriSchemeError");
        } catch (error) {
          expect(error).to.be.instanceof(RetrievalError);
          const retrievalError = /** @type RetrievalError */ (error);
          const cause = /** @type Error */ (retrievalError.cause);
          expect(cause.name).to.equal("UnsupportedUriSchemeError");
        }
      });
    });
  });
});
