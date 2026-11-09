import { describe, test, expect } from "vitest";
import { mediaTypeByExtensionLayer, resolveExtensionUrls } from "./media-type-by-extension.js";
import { problemResponse } from "./problem-details.js";

/** @type (url: string) => string | undefined */
const mediaTypeOf = (url) => url.endsWith(".json") ? "application/json" : undefined;

/**
 * A `Fetch` that answers with a response from `url`
 *
 * @type (url: string, init?: ResponseInit) => (request: Request) => Promise<Response>
 */
const answer = (url, init = {}) => async () => {
  const response = new Response(new TextEncoder().encode("{}"), init);
  Object.defineProperty(response, "url", { value: url });
  return response;
};

/** @type (fetch: (request: Request) => Promise<Response>, url: string) => Promise<string | null> */
const contentType = async (fetch, url) => {
  const response = await fetch(new Request(url));
  return response.headers.get("content-type");
};

describe("media type by extension", () => {
  test("a file gets its extension's", async () => {
    const fetch = mediaTypeByExtensionLayer([], mediaTypeOf)(answer("file:///a/b.json"));
    expect(await contentType(fetch, "file:///a/b.json")).to.equal("application/json");
  });

  test("a file whose extension no plugin has doesn't get one", async () => {
    const fetch = mediaTypeByExtensionLayer([], mediaTypeOf)(answer("file:///a/b.txt"));
    expect(await contentType(fetch, "file:///a/b.txt")).to.equal(null);
  });

  test("a response from a URL that isn't listed keeps its own", async () => {
    const fetch = mediaTypeByExtensionLayer([], mediaTypeOf)(answer("https://example.com/b.json", { headers: { "content-type": "text/plain" } }));
    expect(await contentType(fetch, "https://example.com/b.json")).to.equal("text/plain");
  });

  test("a response from a listed URL gets its extension's", async () => {
    const fetch = mediaTypeByExtensionLayer(["https://example.com/"], mediaTypeOf)(answer("https://example.com/b.json", { headers: { "content-type": "text/plain" } }));
    expect(await contentType(fetch, "https://example.com/b.json")).to.equal("application/json");
  });

  test("it's matched by the response's URL", async () => {
    const fetch = mediaTypeByExtensionLayer(["https://other.example.com/"], mediaTypeOf)(answer("https://other.example.com/b.json"));
    expect(await contentType(fetch, "https://example.com/b")).to.equal("application/json");
  });

  test("an error keeps its media type", async () => {
    const fetch = mediaTypeByExtensionLayer([], mediaTypeOf)(async () => problemResponse("file:///a/b.json", 403, "Forbidden", "No"));
    expect(await contentType(fetch, "file:///a/b.json")).to.equal("application/problem+json");
  });

  test("a URL that isn't http(s): can be listed", () => {
    expect(resolveExtensionUrls(["foo:/a/#b"])).to.eql(["foo:/a/"]);
  });
});
