import { describe, test, expect } from "vitest";
import { fromJs, fromJson } from "./jsonast-util.js";
import { appendToLocation } from "./location.js";

/**
 * @import { JsonNode } from "./jsonast.d.ts"
 */

describe("node locations", () => {
  /** @type [string, string][] */
  const segments = [
    ["foo", "https://example.com/#/foo"],
    ["$defs", "https://example.com/#/$defs"],
    ["rosé", "https://example.com/#/ros%C3%A9"],
    ["a/b~c", "https://example.com/#/a~1b~0c"],
    ["^v", "https://example.com/#/^v"],
    ["foo\tbar", "https://example.com/#/foo%09bar"],
    ["a#b", "https://example.com/#/a#b"],
    ["100%", "https://example.com/#/100%25"]
  ];

  for (const [segment, expected] of segments) {
    test(`appendToLocation('${segment}')`, () => {
      const location = appendToLocation(segment, "https://example.com/#");
      expect(location).to.equal(expected);
      expect(new URL(location).href).to.equal(location);
    });
  }

  test("a segment encoded before is appended to the location it's given", () => {
    expect(appendToLocation("a b", "https://example.com/#")).to.equal("https://example.com/#/a%20b");
    expect(appendToLocation("a b", "https://example.com/#/c")).to.equal("https://example.com/#/c/a%20b");
  });

  test("a long segment is encoded every time", () => {
    const segment = " ".repeat(200);
    const expected = `#/${"%20".repeat(200)}`;
    expect(appendToLocation(segment, "#")).to.equal(expected);
    expect(appendToLocation(segment, "#")).to.equal(expected);
  });

  test("segments are still encoded after more than the cache holds", () => {
    for (let index = 0; index < 20_000; index++) {
      expect(appendToLocation(` ${index}`, "#")).to.equal(`#/%20${index}`);
    }
    expect(appendToLocation(" 0", "#")).to.equal("#/%200");
  });

  test("the parser encodes locations", () => {
    const root = /** @type any */ (fromJson(`{ "a b": [1], "c d": 2 }`, "https://example.com/").node);

    expect(root.children[0].children[1].location).to.equal("https://example.com/#/a%20b");
    expect(root.children[0].children[1].children[0].location).to.equal("https://example.com/#/a%20b/0");
    expect(root.children[1].children[1].location).to.equal("https://example.com/#/c%20d");
  });

  test("fromJs encodes locations", () => {
    const root = /** @type JsonNode & { jsonType: "object" } */ (fromJs({ "a b": [1] }));
    const value = /** @type JsonNode & { jsonType: "array" } */ (root.children[0].children[1]);

    expect(value.location).to.equal("#/a%20b");
    expect(value.children[0].location).to.equal("#/a%20b/0");
  });
});
