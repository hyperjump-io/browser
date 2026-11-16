import { describe, test, expect } from "vitest";
import { jrefSelect, jrefSelectAll } from "./select.js";
import { get } from "./documents.js";
import { jrefMediaType } from "../media-types/jref-media-type.js";
import { toJson } from "../json/jsonast-util.js";
import { coded } from "../test-helpers/errors.js";
import { jrefSite as site } from "../test-helpers/jref-site.js";

/**
 * @import { FollowedNode, Target } from "./documents.d.ts"
 * @import { JrefMediaTypeDocument } from "../media-types/jref-media-type.d.ts"
 */

describe("jrefSelect", () => {
  const swapi = {
    "/films/1": {
      title: "A New Hope",
      characters: [{ $ref: "../people/1" }, { $ref: "../people/2" }],
      director: "George Lucas"
    },
    "/people/1": { name: "Luke Skywalker", homeworld: { $ref: "../planets/1" } },
    "/people/2": { name: "C-3PO", homeworld: { $ref: "../planets/1" } },
    "/planets/1": { name: "Tatooine" }
  };

  test("a child selector doesn't follow what its key rules out", async () => {
    const { session, requests } = site(swapi);
    const film = await get(session, "https://a.test/films/1");

    const director = await jrefSelect(session, ":root > [key=director]", film);

    expect(director && toJson(director.node)).to.equal(`"George Lucas"`);
    expect(requests).to.eql(["/films/1"]);
  });

  test("a selector that starts with '>' starts at the node", async () => {
    const { session } = site(swapi);
    const film = await get(session, "https://a.test/films/1");

    const director = await jrefSelect(session, "> [key=director]", film);

    expect(director && toJson(director.node)).to.equal(`"George Lucas"`);
  });

  test("a path follows the references on it and nothing else", async () => {
    const { session, requests } = site(swapi);
    const film = await get(session, "https://a.test/films/1");

    const names = await jrefSelectAll(session, "> [key=characters] > * > [key=name]", film);

    expect(names.map(({ node }) => toJson(node))).to.eql([`"Luke Skywalker"`, `"C-3PO"`]);
    expect(requests).to.eql(["/films/1", "/people/1", "/people/2"]);
  });

  test("a descendant selector follows everything, and a node is selected once", async () => {
    const { session, requests } = site(swapi);
    const film = await get(session, "https://a.test/films/1");

    const names = await jrefSelectAll(session, "[key=name]", film);

    expect(names.map(({ node }) => toJson(node))).to.eql([`"Luke Skywalker"`, `"Tatooine"`, `"C-3PO"`]);
    expect(requests).to.eql(["/films/1", "/people/1", "/planets/1", "/people/2"]);
  });

  test("jrefSelect stops at the first match", async () => {
    const { session, requests } = site(swapi);
    const film = await get(session, "https://a.test/films/1");

    const name = await jrefSelect(session, "[key=name]", film);

    expect(name && toJson(name.node)).to.equal(`"Luke Skywalker"`);
    expect(requests).to.eql(["/films/1", "/people/1"]);
  });

  test("types and attributes", async () => {
    const { session } = site({ "/subject": { "a": 42, "b": [true, "x"], "c d": null } });
    const subject = await get(session, "https://a.test/subject");

    /** @type (selector: string) => Promise<string[]> */
    const selected = async (selector) => (await jrefSelectAll(session, selector, subject)).map(({ node }) => toJson(node));
    expect(await selected("[jsonType=number]")).to.eql([`42`]);
    expect(await selected("[value=42]")).to.eql([`42`]);
    expect(await selected("json[jsonType=boolean]")).to.eql([`true`]);
    expect(await selected("> [key=b] > [key=1]")).to.eql([`"x"`]);
    expect(await selected(`[key="c d"]`)).to.eql([`null`]);
    expect(await selected("> *")).to.have.length(3);
    expect(await selected("[children]")).to.have.length(2);
    expect(await selected("[value]")).to.have.length(4);
    expect(await selected("something-else")).to.eql([]);
  });

  test("a selector list selects in the order nodes are reached", async () => {
    const { session } = site(swapi);
    const film = await get(session, "https://a.test/films/1");

    const selected = await jrefSelectAll(session, "> [key=director], > [key=title]", film);

    expect(selected.map(({ node }) => toJson(node))).to.eql([`"A New Hope"`, `"George Lucas"`]);
  });

  test(":root is the node", async () => {
    const { session } = site({ "/subject": [1] });
    const subject = await get(session, "https://a.test/subject");

    expect(await jrefSelect(session, ":root", subject)).to.equal(subject);
    expect(await jrefSelect(session, ":scope", subject)).to.equal(subject);
    expect(await jrefSelect(session, "[key=nope]", subject)).to.equal(undefined);
  });

  test("a reference back to an ancestor is walked again for what it could match that the ancestor couldn't", async () => {
    const { session } = site({ "/subject": { y: 1, x: { $ref: "#" } } });
    const subject = await get(session, "https://a.test/subject");

    const descendant = await jrefSelectAll(session, "[key=x] [key=y]", subject);
    expect(descendant.map(({ node }) => node.location)).to.eql(["https://a.test/subject#/y"]);

    const child = await jrefSelectAll(session, "[key=x] > [key=x]", subject);
    expect(child).to.eql([subject]);
  });

  test("a node with the same location as one that's being walked, but another node, is walked", async () => {
    const { session } = site({ "/doc": { b: 1 }, "/other": { $ref: "/doc" } });
    // A tree that says it's the document at /doc, which isn't the one the
    // session retrieves from there for another document's reference
    const mine = await parsed(`{ "a": { "$ref": "/other" } }`, "https://a.test/doc");

    const selected = await jrefSelectAll(session, "[key=b]", mine);

    expect(selected.map(({ node }) => toJson(node))).to.eql([`1`]);
  });

  test("a reference back to an ancestor is selected but not walked again", async () => {
    const { session } = site({ "/subject": { child: { $ref: "#" } } });
    const subject = await get(session, "https://a.test/subject");

    expect(await jrefSelectAll(session, "[key=child]", subject)).to.eql([subject]);
  });

  describe("maxDepth", () => {
    const pages = {
      "/pages/1": { next: { $ref: "2" } },
      "/pages/2": { next: { $ref: "3" } },
      "/pages/3": { next: { $ref: "4" } }
    };

    test("a selector that could match under a node at maxDepth is an error", async () => {
      const { session, requests } = site(pages);
      const subject = await get(session, "https://a.test/pages/1");

      await expect(jrefSelectAll(session, "[key=next]", subject, { maxDepth: 1 })).rejects.toThrow(coded("ERR_MAX_DEPTH", "https://a.test/pages/2#"));
      expect(requests).to.eql(["/pages/1", "/pages/2"]);
    });

    test("a selector that can't match under a node at maxDepth isn't", async () => {
      const { session, requests } = site(pages);
      const subject = await get(session, "https://a.test/pages/1");

      const next = await jrefSelectAll(session, "> [key=next]", subject, { maxDepth: 1 });

      expect(next.map(({ node }) => node.location)).to.eql(["https://a.test/pages/2#"]);
      expect(requests).to.eql(["/pages/1", "/pages/2"]);
    });

    test("a maxDepth that isn't valid is a RangeError", async () => {
      const { session } = site({ "/subject": 1 });
      const subject = await get(session, "https://a.test/subject");

      await expect(jrefSelect(session, ":root", subject, { maxDepth: -1 })).rejects.toThrow(RangeError);
    });
  });

  test.each([
    [""],
    ["[key"],
    ["[key=]"],
    ["a >"],
    ["a,"],
    [`[key="a]`],
    ["a )"],
    ["a + b"],
    ["a ~ b"],
    [":hover"],
    [":has(a)"],
    [":not(a)"],
    ["[key^=a]"]
  ])("'%s' is a SyntaxError", async (selector) => {
    const { session, requests } = site({ "/subject": 1 });
    const subject = await get(session, "https://a.test/subject");

    await expect(jrefSelect(session, selector, subject)).rejects.toThrow(SyntaxError);
    expect(requests).to.eql(["/subject"]);
  });

  test("a SyntaxError says where and what's supported", async () => {
    const { session } = site({ "/subject": 1 });
    const subject = await get(session, "https://a.test/subject");

    await expect(jrefSelect(session, "a + b", subject)).rejects.toThrow("Invalid selector 'a + b' at 2: '+' isn't supported. The combinators are ' ' and '>'");
    await expect(jrefSelect(session, ":has(a)", subject)).rejects.toThrow("':has' isn't supported. The pseudo-classes are ':root' and ':scope'");
  });
});

/**
 * A JRef document the session didn't retrieve
 *
 * @type (text: string, url: string) => Promise<JrefMediaTypeDocument>
 */
const parsed = (text, url) => jrefMediaType.parse({ text: async () => text, url });
