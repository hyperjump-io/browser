import { describe, test, expect } from "vitest";
import { visit } from "unist-util-visit";
import { CONTINUE, EXIT, SKIP, jrefValue, jrefVisit } from "./browsing.js";
import { get, getDocument } from "./documents.js";
import { fromJref } from "../jref/jref-util.js";
import { toJson } from "../json/jsonast-util.js";
import { coded } from "../test-helpers/errors.js";
import { jrefSite as site } from "../test-helpers/jref-site.js";

/**
 * @import { FollowedNode } from "./documents.d.ts"
 * @import { Json } from "../json/jsonast.d.ts"
 */

describe("jrefVisit", () => {
  test("visits values in document order, following references", async () => {
    const { session, requests } = site({
      "/subject": { a: 1, b: [{ $ref: "/external" }, { $ref: "#/a" }] },
      "/external": { c: true }
    });
    const subject = await get(session, "https://a.test/subject");

    /** @type [string | undefined, string, string | undefined, number][] */
    const visited = [];
    await jrefVisit(session, subject, (node, key, parent, depth) => {
      visited.push([key, node.location, parent?.location, depth]);
    });

    expect(visited).to.eql([
      [undefined, "https://a.test/subject#", undefined, 0],
      ["a", "https://a.test/subject#/a", "https://a.test/subject#", 1],
      ["b", "https://a.test/subject#/b", "https://a.test/subject#", 1],
      ["0", "https://a.test/external#", "https://a.test/subject#/b", 2],
      ["c", "https://a.test/external#/c", "https://a.test/external#", 3],
      ["1", "https://a.test/subject#/a", "https://a.test/subject#/b", 2]
    ]);
    expect(requests).to.eql(["/subject", "/external"]);
  });

  test("doesn't follow the references of a node it skips", async () => {
    const { session, requests } = site({ "/subject": { skipped: { a: { $ref: "/never" } }, b: 2 } });
    const subject = await get(session, "https://a.test/subject");

    /** @type string[] */
    const visited = [];
    await jrefVisit(session, subject, (node, key) => {
      visited.push(toJson(node));
      return key === "skipped" ? SKIP : CONTINUE;
    });

    expect(visited.slice(1)).to.eql([`{"a":{"$ref":"/never"}}`, `2`]);
    expect(requests).to.eql(["/subject"]);
  });

  test("stops at EXIT", async () => {
    const { session } = site({ "/subject": [1, 2, 3] });
    const subject = await get(session, "https://a.test/subject");

    /** @type string[] */
    const visited = [];
    await jrefVisit(session, subject, async (node) => {
      visited.push(toJson(node));
      return toJson(node) === "2" ? EXIT : CONTINUE;
    });

    expect(visited).to.eql([`[1,2,3]`, `1`, `2`]);
  });

  test("a visitor limits the depth with SKIP", async () => {
    const { session, requests } = site({
      "/pages/1": { next: { $ref: "2" } },
      "/pages/2": { next: { $ref: "3" } },
      "/pages/3": { next: { $ref: "4" } }
    });
    const subject = await get(session, "https://a.test/pages/1");

    await jrefVisit(session, subject, (_node, _key, _parent, depth) => depth === 1 ? SKIP : CONTINUE);

    expect(requests).to.eql(["/pages/1", "/pages/2"]);
  });

  test("visits a reference back to an ancestor without descending into it", async () => {
    const { session } = site({ "/subject": { type: "tree", children: { items: { $ref: "#" } } } });
    const subject = await get(session, "https://a.test/subject");

    /** @type string[] */
    const visited = [];
    await jrefVisit(session, subject, (node) => {
      visited.push(node.location);
    });

    expect(visited).to.eql([
      "https://a.test/subject#",
      "https://a.test/subject#/type",
      "https://a.test/subject#/children",
      "https://a.test/subject#"
    ]);
  });

  test("a node with the same location as one that's being visited, but another node, is descended into", async () => {
    const { session } = site({ "/doc": { b: 1 } });
    // A tree that says it's the document at /doc, which isn't the one the
    // session retrieves from there
    const { node } = fromJref(`{ "a": { "$ref": "/doc" } }`, "https://a.test/doc");

    /** @type string[] */
    const visited = [];
    await jrefVisit(session, /** @type FollowedNode */ (node), (visitedNode, key) => {
      visited.push(`${key} ${toJson(visitedNode)}`);
    });

    expect(visited).to.eql([`undefined {"a":{"$ref":"/doc"}}`, `a {"b":1}`, `b 1`]);
  });

  test("visits a value reached through two references each time", async () => {
    const { session } = site({ "/subject": { a: { $ref: "#/shared" }, b: { $ref: "#/shared" }, shared: { x: 1 } } });
    const subject = await get(session, "https://a.test/subject");

    /** @type string[] */
    const visited = [];
    await jrefVisit(session, subject, (node) => {
      visited.push(node.location);
    });

    expect(visited.filter((location) => location === "https://a.test/subject#/shared/x")).to.have.length(3);
  });

  describe("maxDepth", () => {
    /** @type Record<string, Json> */
    const pages = {};
    for (let page = 1; page <= 2000; page++) {
      pages[`/pages/${page}`] = { next: { $ref: `${page + 1}` } };
    }

    test("going under a node at maxDepth is an error with a code and the node's location", async () => {
      const { session } = site({ "/subject": { a: { b: { c: 1 } } } });
      const subject = await get(session, "https://a.test/subject");

      const visit = jrefVisit(session, subject, () => {}, { maxDepth: 2 });

      await expect(visit).rejects.toThrow(coded("ERR_MAX_DEPTH", "https://a.test/subject#/a/b"));
      await expect(visit).rejects.toMatchObject({ cause: { maxDepth: 2 } });
    });

    test("a reference under a node at maxDepth isn't followed", async () => {
      const { session, requests } = site(pages);
      const subject = await get(session, "https://a.test/pages/1");

      // A page's `next` is the next page, so each page is a level deeper
      await expect(jrefVisit(session, subject, () => {}, { maxDepth: 1 })).rejects.toThrow(coded("ERR_MAX_DEPTH", "https://a.test/pages/2#"));
      expect(requests).to.eql(["/pages/1", "/pages/2"]);
    });

    test("it isn't an error when nothing would be walked under a node at maxDepth", async () => {
      const { session } = site({ "/subject": { empty: [], scalar: 1, cycle: { $ref: "#" }, skipped: { a: 1 } } });
      const subject = await get(session, "https://a.test/subject");

      let count = 0;
      await jrefVisit(session, subject, (_node, key) => {
        count++;
        return key === "skipped" ? SKIP : CONTINUE;
      }, { maxDepth: 1 });

      expect(count).to.equal(5);
    });

    test("it's after a test", async () => {
      const { session } = site({ "/subject": { a: { b: 1 } } });
      const subject = await get(session, "https://a.test/subject");

      await expect(jrefVisit(session, subject, "json", () => {}, { maxDepth: 1 })).rejects.toThrow(coded("ERR_MAX_DEPTH"));
    });

    test("the default is 1000, and Infinity doesn't limit it", async () => {
      const { session } = site(pages);
      const subject = await get(session, "https://a.test/pages/1");

      await expect(jrefVisit(session, subject, () => {})).rejects.toThrow(coded("ERR_MAX_DEPTH", "https://a.test/pages/1001#"));

      let count = 0;
      const infinite = jrefVisit(session, subject, () => {
        count++;
      }, { maxDepth: Infinity });
      // The last page's `next` is a page that doesn't exist
      await expect(infinite).rejects.toThrow(coded("ERR_HTTP_STATUS", "https://a.test/pages/2001"));
      expect(count).to.equal(2000);
    });

    test.each([[-1], [1.5], [Number.NaN]])("%s is a RangeError", async (maxDepth) => {
      const { session } = site({ "/subject": 1 });
      const subject = await get(session, "https://a.test/subject");

      await expect(jrefVisit(session, subject, () => {}, { maxDepth })).rejects.toThrow(RangeError);
    });
  });

  describe("tests", () => {
    const pages = {
      "/subject": { a: 1, b: { $ref: "/external" }, c: [true, "x"] },
      "/external": { d: 2 }
    };

    test("an object test passes nodes with its properties", async () => {
      const { session } = site(pages);
      const subject = await get(session, "https://a.test/subject");

      /** @type number[] */
      const numbers = [];
      await jrefVisit(session, subject, { jsonType: "number" }, (node) => {
        numbers.push(jrefValue(node));
      });

      // 2 is under a reference, which the walk follows to look for numbers
      expect(numbers).to.eql([1, 2]);
    });

    test("an array test passes nodes that pass any of its tests", async () => {
      const { session } = site(pages);
      const subject = await get(session, "https://a.test/subject");

      /** @type (string | boolean)[] */
      const values = [];
      await jrefVisit(session, subject, [{ jsonType: "string" }, { jsonType: "boolean" }], (node) => {
        values.push(jrefValue(node));
      });

      expect(values).to.eql([true, "x"]);
    });

    test("a string test passes nodes of that type", async () => {
      const { session } = site({ "/subject": [1, 2] });
      const subject = await get(session, "https://a.test/subject");

      let json = 0;
      await jrefVisit(session, subject, "json", () => {
        json++;
      });
      let other = 0;
      await jrefVisit(session, subject, "something-else", () => {
        other++;
      });

      expect([json, other]).to.eql([3, 0]);
    });

    test("a function test gets the key and parent", async () => {
      const { session } = site(pages);
      const subject = await get(session, "https://a.test/subject");

      /** @type (string | undefined)[] */
      const keys = [];
      await jrefVisit(session, subject, (_node, key, parent) => parent?.jsonType === "array" || key === "b", (_node, key) => {
        keys.push(key);
      });

      expect(keys).to.eql(["b", "0", "1"]);
    });

    test("a null or undefined test passes every node, like unist-util-is's", async () => {
      const { session } = site({ "/subject": [1, 2] });
      const subject = await get(session, "https://a.test/subject");

      let count = 0;
      await jrefVisit(session, subject, null, () => {
        count++;
      });
      await jrefVisit(session, subject, undefined, () => {
        count++;
      });

      expect(count).to.equal(6);
    });

    test("an array of tests with an array in it is a TypeError", async () => {
      const { session } = site({ "/subject": 1 });
      const subject = await get(session, "https://a.test/subject");

      // @ts-expect-error An array's tests can't be arrays
      await expect(jrefVisit(session, subject, [["json"]], () => {})).rejects.toThrow(TypeError);
    });

    test("a test that isn't a test is a TypeError", async () => {
      const { session } = site({ "/subject": 1 });
      const subject = await get(session, "https://a.test/subject");

      // @ts-expect-error A number isn't a test
      await expect(jrefVisit(session, subject, 42, () => {})).rejects.toThrow(TypeError);
    });
  });
});

describe("unist utilities", () => {
  test("unist-util-visit finds the references in a document as it's written", async () => {
    const { session, requests } = site({ "/doc": { a: { $ref: "#/b" }, b: [{ $ref: "other#/x" }] } });
    const document = await getDocument(session, "https://a.test/doc");

    /** @type string[] */
    const hrefs = [];
    visit(document, "reference", (node) => {
      hrefs.push(node.href);
    });

    expect(hrefs).to.eql(["https://a.test/doc#/b", "https://a.test/other#/x"]);
    expect(requests).to.eql(["/doc"]);
  });
});
