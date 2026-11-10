import { describe, test, expect } from "vitest";
import { contentTypeByExtension } from "./content-type.js";

describe("content type by extension", () => {
  test("is found by a path's or URL's extension", () => {
    expect(contentTypeByExtension("/a/b.json")).to.equal("application/json");
    expect(contentTypeByExtension("https://example.com/a.CSS?v=1#x")).to.equal("text/css; charset=utf-8");
  });

  test("is undefined without an extension, or for one it doesn't know", () => {
    expect(contentTypeByExtension("/a.b/c")).to.equal(undefined);
    expect(contentTypeByExtension("/a/b.unknown")).to.equal(undefined);
    expect(contentTypeByExtension("/a/b.constructor")).to.equal(undefined);
  });

  test("overrides win", () => {
    expect(contentTypeByExtension("/a.json", { json: "application/schema+json" })).to.equal("application/schema+json");
  });
});
