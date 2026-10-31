import { Readable } from "node:stream";
import { describe, test, beforeEach, afterEach, expect } from "vitest";
import { Hyperjump, RetrievalError } from "./index.js";

/**
 * @import { Session } from "./index.js"
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

    describe("Custom URI scheme plugin", () => {
      /** @type Hyperjump */
      let hyperjump;
      /** @type Session */
      let session;

      beforeEach(() => {
        hyperjump = new Hyperjump({ allowRetrieval: ["foo:something"] });
        session = hyperjump.session();

        hyperjump.addUriSchemePlugin({
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
        });
      });

      afterEach(() => {
        hyperjump.removeUriSchemePlugin("application/foo");
      });

      test("addUriSchemePlugin", async () => {
        await session.get("foo:something");
      });

      test("a plugin is given the Accept header", async () => {
        /** @type string | undefined */
        let accept;
        hyperjump.addUriSchemePlugin({
          schemes: ["foo"],
          retrieve: async (_uri, options) => {
            accept = options.accept;
            return new Response(fixtureDocument, { headers: { "Content-Type": "application/reference+json" } });
          }
        });

        await session.get("foo:something");
        expect(accept).to.equal(hyperjump.acceptableMediaTypes());
      });

      test("a response without a Content-Type has its extension's media type", async () => {
        hyperjump.addUriSchemePlugin({
          schemes: ["foo"],
          retrieve: async (uri) => {
            // A string body would get a `Content-Type`
            const response = new Response(new TextEncoder().encode(fixtureDocument));
            Object.defineProperty(response, "url", { value: uri });
            return response;
          }
        });

        const response = await hyperjump.retrieve("foo:something.json", {});
        expect(response.headers.get("content-type")).to.equal("application/json");
        expect(response.url).to.equal("foo:something.json");
        expect(await response.text()).to.equal(fixtureDocument);
        await expect(hyperjump.retrieve("foo:something", {})).rejects.toThrow("could not be determined");
      });

      test("removeUriSchemePlugin", async () => {
        hyperjump.removeUriSchemePlugin("foo");

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
    });
  });
});
