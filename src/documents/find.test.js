import { describe, test, expect } from "vitest";
import { jrefFind, jrefFindAll } from "./visit.js";
import { browse } from "./documents.js";
import { toJson } from "../json/jsonast-util.js";
import { coded } from "../test-helpers/errors.js";
import { jrefSite as site } from "../test-helpers/jref-site.js";

describe("jrefFind", () => {
  const swapi = {
    "/films/1": {
      title: "A New Hope",
      characters: [{ $ref: "../people/1" }, { $ref: "../people/2" }],
      episode: 4
    },
    "/people/1": { name: "Luke Skywalker", height: 172, homeworld: { $ref: "../planets/1" } },
    "/people/2": { name: "C-3PO", height: 167, homeworld: { $ref: "../planets/1" } },
    "/planets/1": { name: "Tatooine", diameter: 10465 }
  };

  test("finds the first node that passes, and retrieves nothing after it", async () => {
    const { session, requests } = site(swapi);
    const film = await browse(session, "https://a.test/films/1");

    const number = await jrefFind(session, film, { jsonType: "number" });

    expect(number?.node.value).to.equal(172);
    expect(requests).to.eql(["/films/1", "/people/1"]);
  });

  test("is undefined if nothing passes", async () => {
    const { session } = site(swapi);
    const film = await browse(session, "https://a.test/films/1");

    expect(await jrefFind(session, film, "something-else")).to.equal(undefined);
  });

  test("can find the node it starts at", async () => {
    const { session } = site(swapi);
    const film = await browse(session, "https://a.test/films/1");

    expect(await jrefFind(session, film, { jsonType: "object" })).to.equal(film);
  });

  test("finds all in the order they're visited, each once", async () => {
    const { session } = site(swapi);
    const film = await browse(session, "https://a.test/films/1");

    const numbers = await jrefFindAll(session, film, { jsonType: "number" });

    // Tatooine is reached from both people
    expect(numbers.map(({ node }) => toJson(node))).to.eql([`172`, `10465`, `167`, `4`]);
  });

  test("a function test gets the key", async () => {
    const { session } = site(swapi);
    const film = await browse(session, "https://a.test/films/1");

    const names = await jrefFindAll(session, film, (_target, key) => key === "name");

    expect(names.map(({ node }) => toJson(node))).to.eql([`"Luke Skywalker"`, `"Tatooine"`, `"C-3PO"`]);
  });

  test("takes a walk's options", async () => {
    const { session } = site(swapi);
    const film = await browse(session, "https://a.test/films/1");

    await expect(jrefFindAll(session, film, "json", { maxDepth: 1 })).rejects.toThrow(coded("ERR_MAX_DEPTH", "https://a.test/films/1#/characters"));
  });

  test("a test that isn't a test is a TypeError", async () => {
    const { session } = site({ "/subject": 1 });
    const subject = await browse(session, "https://a.test/subject");

    // @ts-expect-error A number isn't a test
    await expect(jrefFind(session, subject, 42)).rejects.toThrow(TypeError);
  });
});
