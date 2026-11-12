import { describe, test, expect } from "vitest";
import { urlEntries } from "./url-entries.js";
import { headersFor } from "./request-headers.js";

/**
 * @import { HeadersFunction } from "./hyperjump.d.ts"
 */

describe("request headers", () => {
  test("are merged from the shortest key to the longest", async () => {
    const entries = urlEntries(/** @type Record<string, HeadersInit> */ ({
      "https://a.test/": { "x-a": "origin", "x-b": "origin" },
      "https://a.test/api/": { "x-b": "api" }
    }));
    expect([...await headersFor(entries, "https://a.test/api/x")]).to.eql([["x-a", "origin"], ["x-b", "api"]]);
    expect([...await headersFor(entries, "https://b.test/")]).to.eql([]);
  });

  test("a function is given the URL without its fragment, and can be async", async () => {
    /** @type string[] */
    const urls = [];
    const entries = urlEntries(/** @type Record<string, HeadersFunction> */ ({
      "https://a.test/": async (/** @type URL */ url) => {
        urls.push(url.href);
        return { authorization: "Bearer refreshed" };
      },
      "https://a.test/none": () => undefined
    }));
    expect((await headersFor(entries, "https://a.test/x#y")).get("authorization")).to.equal("Bearer refreshed");
    expect((await headersFor(entries, "https://a.test/none")).get("authorization")).to.equal("Bearer refreshed");
    expect(urls).to.eql(["https://a.test/x", "https://a.test/none"]);
  });
});
