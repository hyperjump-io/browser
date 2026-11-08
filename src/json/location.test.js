import { describe, test, expect } from "vitest";
import { InvalidIriError } from "@hyperjump/uri";
import { fromJs, fromJson } from "./jsonast-util.js";
import { appendToLocation } from "./location.js";

/**
 * @import { IriReference } from "@hyperjump/uri"
 * @import { JsonNode } from "./jsonast.d.ts"
 */

describe("node locations", () => {
  const base = /** @type IriReference */ ("https://example.com#");
  const fragmentOnly = /** @type IriReference */ ("#");

  /** @type [string, string][] */
  const segments = [
    ["foo", "https://example.com#/foo"],
    ["$defs", "https://example.com#/$defs"],
    ["rosé", "https://example.com#/rosé"],
    ["a/b~c", "https://example.com#/a~1b~0c"],
    ["^v", "https://example.com#/%5Ev"],
    ["foo\tbar", "https://example.com#/foo%09bar"],
    ["a#b", "https://example.com#/a%23b"],
    ["100%", "https://example.com#/100%25"]
  ];

  for (const [segment, expected] of segments) {
    test(`appendToLocation('${segment}')`, () => {
      expect(appendToLocation(segment, base)).to.equal(expected);
    });
  }

  test("a segment encoded before is appended to the location it's given", () => {
    expect(appendToLocation("a^b", base)).to.equal("https://example.com#/a%5Eb");
    expect(appendToLocation("a^b", /** @type IriReference */ ("https://example.com#/c"))).to.equal("https://example.com#/c/a%5Eb");
  });

  test("a long segment is encoded every time", () => {
    const segment = "^".repeat(200);
    const expected = `#/${"%5E".repeat(200)}`;
    expect(appendToLocation(segment, fragmentOnly)).to.equal(expected);
    expect(appendToLocation(segment, fragmentOnly)).to.equal(expected);
  });

  test("segments are still encoded after more than the cache holds", () => {
    for (let index = 0; index < 20_000; index++) {
      expect(appendToLocation(`^${index}`, fragmentOnly)).to.equal(`#/%5E${index}`);
    }
    expect(appendToLocation("^0", fragmentOnly)).to.equal("#/%5E0");
  });

  test("the parser encodes locations", () => {
    const root = /** @type any */ (fromJson(`{ "a^b": [1], "c d": 2 }`, "https://example.com").node);

    expect(root.children[0].children[1].location).to.equal("https://example.com#/a%5Eb");
    expect(root.children[0].children[1].children[0].location).to.equal("https://example.com#/a%5Eb/0");
    expect(root.children[1].children[1].location).to.equal("https://example.com#/c%20d");
  });

  test("fromJs encodes locations", () => {
    const root = /** @type JsonNode & { jsonType: "object" } */ (fromJs({ "a^b": [1] }));
    const value = /** @type JsonNode & { jsonType: "array" } */ (root.children[0].children[1]);

    expect(value.location).to.equal("#/a%5Eb");
    expect(value.children[0].location).to.equal("#/a%5Eb/0");
  });

  test.each([
    ["relative", "doc.json"],
    ["with a fragment", "https://example.com/doc#a"],
    ["not an IRI", "https://example.com/a b"]
  ])("fromJson's location can't be %s", (_description, location) => {
    expect(() => fromJson("1", location)).toThrow(InvalidIriError);
  });

  test("fromJs's location has to be an IRI-reference", () => {
    expect(() => fromJs(1, "https://example.com/a b#")).toThrow(InvalidIriError);
  });
});
