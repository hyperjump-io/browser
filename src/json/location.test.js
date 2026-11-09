import { describe, test, expect } from "vitest";
import { fromJs, fromJson } from "./jsonast-util.js";
import { appendToLocation } from "./location.js";

/**
 * @import { JsonNode } from "./jsonast.d.ts"
 */

describe("node locations", () => {
  const base = "https://example.com/#";

  /** @type [string, string][] */
  const segments = [
    ["foo", "https://example.com/#/foo"],
    ["$defs", "https://example.com/#/$defs"],
    ["rosé", "https://example.com/#/ros%C3%A9"],
    ["a/b~c", "https://example.com/#/a~1b~0c"],
    ["^v", "https://example.com/#/^v"],
    ["a b", "https://example.com/#/a%20b"],
    ["<`\">", "https://example.com/#/%3C%60%22%3E"],
    ["foo\tbar", "https://example.com/#/foo%09bar"],
    ["a#b", "https://example.com/#/a#b"],
    ["100%", "https://example.com/#/100%25"],
    ["\uD800", "https://example.com/#/%EF%BF%BD"]
  ];

  for (const [segment, expected] of segments) {
    test(`appendToLocation('${segment}')`, () => {
      expect(appendToLocation(segment, base)).to.equal(expected);
    });

    test(`appendToLocation('${segment}') is its own href`, () => {
      const location = appendToLocation(segment, base);
      expect(new URL(location).href).to.equal(location);
    });
  }

  test("a segment encoded before is appended to the location it's given", () => {
    expect(appendToLocation("a b", base)).to.equal("https://example.com/#/a%20b");
    expect(appendToLocation("a b", "https://example.com/#/c")).to.equal("https://example.com/#/c/a%20b");
  });

  test("a long segment is encoded every time", () => {
    const segment = " ".repeat(200);
    const expected = `${base}/${"%20".repeat(200)}`;
    expect(appendToLocation(segment, base)).to.equal(expected);
    expect(appendToLocation(segment, base)).to.equal(expected);
  });

  test("segments are still encoded after more than the cache holds", () => {
    for (let index = 0; index < 20_000; index++) {
      expect(appendToLocation(` ${index}`, base)).to.equal(`${base}/%20${index}`);
    }
    expect(appendToLocation(" 0", base)).to.equal(`${base}/%200`);
  });

  test("the parser encodes locations", () => {
    const root = /** @type any */ (fromJson(`{ "a b": [1], "c<d": 2 }`, "https://example.com").node);

    expect(root.children[0].children[1].location).to.equal("https://example.com/#/a%20b");
    expect(root.children[0].children[1].children[0].location).to.equal("https://example.com/#/a%20b/0");
    expect(root.children[1].children[1].location).to.equal("https://example.com/#/c%3Cd");
  });

  test("fromJs encodes locations", () => {
    const root = /** @type JsonNode & { jsonType: "object" } */ (fromJs({ "a b": [1] }, "https://example.com/doc#"));
    const value = /** @type JsonNode & { jsonType: "array" } */ (root.children[0].children[1]);

    expect(value.location).to.equal("https://example.com/doc#/a%20b");
    expect(value.children[0].location).to.equal("https://example.com/doc#/a%20b/0");
  });

  test("fromJs's location without a fragment is a document's root", () => {
    expect(fromJs(1, "https://example.com/doc").location).to.equal("https://example.com/doc#");
  });

  test("fromJs's location is parsed", () => {
    expect(fromJs(1, "HTTPS://Example.com/a b#/c").location).to.equal("https://example.com/a%20b#/c");
  });

  test.each([
    ["relative", "doc.json"],
    ["with a fragment", "https://example.com/doc#a"],
    ["not a URL", "https://["]
  ])("fromJson's URL can't be %s", (_description, url) => {
    expect(() => fromJson("1", url)).toThrow(TypeError);
  });

  test("fromJs's location has to be a URL", () => {
    expect(() => fromJs(1, "doc.json#")).toThrow(TypeError);
  });
});
