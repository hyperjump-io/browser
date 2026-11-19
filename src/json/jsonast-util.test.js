import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { describe, test, expect, beforeEach } from "vitest";
import {
  fromJs,
  fromJson,
  hasStatus,
  jsonSyntaxErrorMessage,
  toJson,
  jsonObjectHas,
  jsonArrayIter,
  jsonObjectKeys,
  jsonObjectValues,
  jsonObjectEntries,
  jsonValue,
  jsonPointerGet,
  jsonStep
} from "./jsonast-util.js";
import { coded } from "../test-helpers/errors.js";

/**
 * @import { JsonNode, JsonTolerantNode, ReadonlyJson } from "./jsonast.d.ts"
 */

describe("jsonast-util", async () => {
  const testPath = resolve(import.meta.dirname, "jsonast-util-tests");
  for (const entry of await readdir(testPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const file = resolve(entry.parentPath, entry.name);
    const json = await readFile(file, "utf8");

    if (entry.name.startsWith("y_")) {
      test(`${entry.name.substring(2)} without spaces`, () => {
        expect(toJson(parse(json))).to.eql(JSON.stringify(JSON.parse(json)));
      });

      test(`${entry.name.substring(2)} with spaces`, () => {
        expect(toJson(parse(json), { space: "  " })).to.eql(JSON.stringify(JSON.parse(json), null, "  "));
      });

      test(`${entry.name.substring(2)} with a number of spaces`, () => {
        expect(toJson(parse(json), { space: 2 })).to.eql(JSON.stringify(JSON.parse(json), null, 2));
      });
    } else if (entry.name.startsWith("n_")) {
      test(entry.name.substring(2), () => {
        expect(fromJson(json, "https://example.com/doc").document.status).not.to.equal("success");
      });
    }
  }

  describe("type/value and type narrowing", () => {
    test("null", () => {
      const node = parse(`null`);
      const subject = jsonValue(node);
      expect(subject).to.equal(null);
    });

    test("boolean", () => {
      const node = parse(`true`);
      const subject = jsonValue(node);
      expect(subject).to.equal(true);
    });

    test("number", () => {
      const node = parse(`42`);
      const subject = jsonValue(node);
      expect(subject).to.equal(42);
    });

    test("string", () => {
      const node = parse(`"foo"`);
      const subject = jsonValue(node);
      expect(subject).to.equal("foo");
    });

    test("array", () => {
      const node = parse(`["foo", [42]]`);
      const subject = jsonValue(node);
      expect(subject).to.eql(["foo", [42]]);
    });

    test("object", () => {
      const node = parse(`{ "foo": { "bar": 42 } }`);
      const subject = jsonValue(node);
      expect(subject).to.eql({ foo: { bar: 42 } });
    });

    test("a property name", () => {
      const node = parse(`{ "foo": 42 }`);
      if (node.jsonType !== "object") {
        throw Error("Expected an object");
      }
      expect(jsonValue(node.children[0].children[0])).to.equal("foo");
    });

    test("a '__proto__' property is an own property, not the prototype", () => {
      const node = parse(`{ "__proto__": { "isAdmin": true } }`);
      const subject = /** @type Record<string, unknown> */ (jsonValue(node));
      expect(Object.getPrototypeOf(subject)).to.equal(Object.prototype);
      expect(Object.hasOwn(subject, "__proto__")).to.equal(true);
      expect(subject).to.eql(JSON.parse(`{ "__proto__": { "isAdmin": true } }`));
    });

    test("values that couldn't be parsed", () => {
      const node = /** @type JsonNode */ (fromJson(`{ "foo": , "bar": [1, , NaN, 2], "baz": True }`, "https://example.com/doc").document.children[0]);
      const subject = jsonValue(node);
      expect(subject).to.eql({ bar: [1, null, null, 2] });
    });
  });

  describe("object has property", () => {
    /** @type JsonNode */
    let subject;

    beforeEach(() => {
      subject = parse(`{
        "foo": 42
      }`);
    });

    test("true", () => {
      expect(jsonObjectHas("foo", subject)).to.equal(true);
    });

    test("false", () => {
      expect(jsonObjectHas("bar", subject)).to.equal(false);
    });
  });

  describe("jsonStep duplicate property names", () => {
    /** @type JsonNode */
    let subject;

    beforeEach(() => {
      subject = parse(`{ "foo": 1, "bar": 2, "foo": 3 }`);
    });

    test("stepping into a duplicated property fails", () => {
      expect(() => jsonStep("foo", subject)).toThrow(coded("ERR_POINTER_DUPLICATE_PROPERTY", "https://example.com/doc#/foo"));
    });

    test("stepping into a unique property in the same object works", () => {
      expect(toJson(jsonStep("bar", subject))).to.equal(`2`);
    });
  });

  describe("jsonStep array index", () => {
    /** @type JsonNode */
    let subject;

    beforeEach(() => {
      subject = parse(`[0, 1, 2]`);
    });

    test("valid index", () => {
      expect(toJson(jsonStep("1", subject))).to.equal(`1`);
    });

    test("zero", () => {
      expect(toJson(jsonStep("0", subject))).to.equal(`0`);
    });

    test("leading zero is not a valid index", () => {
      expect(() => jsonStep("01", subject)).toThrow(coded("ERR_POINTER_INVALID_INDEX"));
    });

    test("trailing characters are not a valid index", () => {
      expect(() => jsonStep("1abc", subject)).toThrow(coded("ERR_POINTER_INVALID_INDEX"));
    });

    test("negative numbers are not a valid index", () => {
      expect(() => jsonStep("-1", subject)).toThrow(coded("ERR_POINTER_INVALID_INDEX"));
    });

    test("decimals are not a valid index", () => {
      expect(() => jsonStep("1.0", subject)).toThrow(coded("ERR_POINTER_INVALID_INDEX"));
    });

    test("out of range", () => {
      expect(() => jsonStep("3", subject)).toThrow(coded("ERR_POINTER_NOT_FOUND"));
    });

    test("'-' refers to a nonexistent element", () => {
      expect(() => jsonStep("-", subject)).toThrow(coded("ERR_POINTER_NOT_FOUND"));
    });
  });

  describe("fromJs", () => {
    test("a number that isn't finite isn't JSON, so it's the caller's mistake", () => {
      expect(() => fromJs([Infinity], "https://example.com/doc")).to.throw(TypeError, "Infinity isn't a JSON number");
      expect(() => fromJs(-Infinity, "https://example.com/doc")).to.throw(TypeError, "-Infinity isn't a JSON number");
      expect(() => fromJs(NaN, "https://example.com/doc")).to.throw(TypeError, "NaN isn't a JSON number");
    });

    test("an object without a prototype is a JSON object, as it is to JSON.stringify", () => {
      const record = Object.assign(Object.create(null), { a: 1, ["__proto__"]: 2 });
      expect(toJson(fromJs(record, "https://example.com/doc"))).to.equal(JSON.stringify(record));
    });

    test("an object of a class isn't JSON, so it's the caller's mistake", () => {
      expect(() => fromJs(/** @type ReadonlyJson */ (/** @type unknown */ (new Date(0))), "https://example.com/doc")).to.throw(TypeError, "Not a JSON compatible type: Date");
    });
  });

  describe("JSON Pointer syntax", () => {
    const subject = /** @type JsonTolerantNode */ (fromJson(`{ "a/b": { "~": 1 } }`, "https://example.com/doc").document.children[0]);

    test("~1 is a / and ~0 is a ~", () => {
      expect(jsonValue(/** @type JsonTolerantNode */ (jsonPointerGet("/a~1b/~0", subject)))).to.equal(1);
    });

    test("a pointer that isn't empty and doesn't start with / isn't one, which is the caller's mistake", () => {
      expect(() => jsonPointerGet("a", subject)).to.throw(TypeError, "'a' isn't a JSON Pointer");
    });

    test("a ~ that isn't ~0 or ~1 isn't an escape, so the pointer isn't one", () => {
      expect(() => jsonPointerGet("/a~2b", subject)).to.throw(TypeError, "'/a~2b' isn't a JSON Pointer");
      expect(() => jsonPointerGet("/a~", subject)).to.throw(TypeError, "'/a~' isn't a JSON Pointer");
    });
  });

  describe("JSON Pointer error messages", () => {
    test("say the location from the node", () => {
      const subject = /** @type JsonTolerantNode */ (fromJson(`{ "a": { "b": 1 } }`, "https://example.com/doc").document.children[0]);
      expect(() => jsonPointerGet("/a/c", subject)).to.throw("Property 'c' doesn't exist at https://example.com/doc#/a/c");
      expect(() => jsonPointerGet("/a/c", subject)).toThrow(coded("ERR_POINTER_NOT_FOUND", "https://example.com/doc#/a/c"));
    });

    test("say the location of a missing value", () => {
      const subject = /** @type JsonTolerantNode */ (fromJson(`{ "a": }`, "https://example.com/doc").document.children[0]);
      expect(() => jsonPointerGet("/a/b", subject)).to.throw("Can't index into a missing value at https://example.com/doc#/a");
      expect(() => jsonPointerGet("/a/b", subject)).toThrow(coded("ERR_POINTER_NOT_INDEXABLE", "https://example.com/doc#/a"));
    });

    test("say the location of a missing root", () => {
      const subject = /** @type JsonTolerantNode */ (fromJson(``, "https://example.com/doc").document.children[0]);
      expect(() => jsonPointerGet("/a", subject)).to.throw("Can't index into a missing value at https://example.com/doc#");
      expect(() => jsonPointerGet("/a", subject)).toThrow(coded("ERR_POINTER_NOT_INDEXABLE", "https://example.com/doc#"));
    });

    test("say the location of an invalid value", () => {
      const subject = /** @type JsonTolerantNode */ (fromJson(`{ "a": NaN }`, "https://example.com/doc").document.children[0]);
      expect(() => jsonPointerGet("/a/b", subject)).to.throw("Can't index into an invalid value at https://example.com/doc#/a");
      expect(() => jsonPointerGet("/a/b", subject)).toThrow(coded("ERR_POINTER_NOT_INDEXABLE", "https://example.com/doc#/a"));
    });

    test("say a file URL relative to the working directory", () => {
      const subject = /** @type JsonTolerantNode */ (fromJson(`{}`, `${pathToFileURL(cwd()).href}/data/a.json`).document.children[0]);
      expect(() => jsonPointerGet("/a", subject)).to.throw("Property 'a' doesn't exist at data/a.json#/a");
      expect(() => jsonPointerGet("/a", subject)).toThrow(coded("ERR_POINTER_NOT_FOUND", `${pathToFileURL(cwd()).href}/data/a.json#/a`));
    });

    test("say an index that doesn't exist", () => {
      const subject = parse(`[]`);
      expect(() => jsonStep("0", subject)).to.throw("Index '0' doesn't exist at https://example.com/doc#/0");
      expect(() => jsonStep("0", subject)).toThrow(coded("ERR_POINTER_NOT_FOUND", "https://example.com/doc#/0"));
    });
  });

  test("missing colon error points at the property name it should follow", () => {
    const error = fromJson(`{ "foo"\n\n  1 }`, "https://example.com/doc").errors[0];
    expect(jsonSyntaxErrorMessage(error)).to.equal("Expected a colon");
    expect(error.place).to.eql({
      start: { line: 1, column: 3, offset: 2 },
      end: { line: 1, column: 8, offset: 7 }
    });
  });

  test("iter", () => {
    const subject = parse(`[1, 2]`);

    const generator = jsonArrayIter(subject);

    const first = generator.next();
    expect(!first.done && toJson(first.value)).to.equal(`1`);
    const second = generator.next();
    expect(!second.done && toJson(second.value)).to.equal(`2`);
    expect((generator.next()).done).to.equal(true);
  });

  test("an iterator isn't a generator, is iterable, and stays done", () => {
    const subject = parse(`[1, 2]`);

    const iterator = jsonArrayIter(subject);
    expect(Object.prototype.toString.call(iterator)).to.not.equal("[object Generator]");
    expect(iterator[Symbol.iterator]()).to.equal(iterator);
    expect([...jsonArrayIter(subject)].map((node) => node && toJson(node))).to.eql([`1`, `2`]);

    iterator.next();
    expect(iterator.return?.()).to.eql({ value: undefined, done: true });
    expect(iterator.next(), "it's done once it's closed").to.eql({ value: undefined, done: true });

    const exhausted = jsonArrayIter(subject);
    exhausted.next();
    exhausted.next();
    expect(exhausted.next().done).to.equal(true);
    expect(exhausted.next().done, "and it stays done").to.equal(true);
  });

  test("keys", () => {
    const subject = parse(`{
      "a": 1,
      "b": 2
    }`);

    const generator = jsonObjectKeys(subject);

    expect(generator.next().value).to.equal("a");
    expect(generator.next().value).to.equal("b");
    expect(generator.next().done).to.equal(true);
  });

  test("values", () => {
    const subject = parse(`{
      "a": 1,
      "b": 2
    }`);

    const generator = jsonObjectValues(subject);

    const first = generator.next();
    expect(!first.done && toJson(first.value)).to.equal(`1`);
    const second = generator.next();
    expect(!second.done && toJson(second.value)).to.equal(`2`);
    expect((generator.next()).done).to.equal(true);
  });

  test("entries", () => {
    const subject = parse(`{
      "a": 1,
      "b": 2
    }`);

    const generator = jsonObjectEntries(subject);

    const a = /** @type [string, JsonNode] */ ((generator.next()).value);
    expect(a[0]).to.equal("a");
    expect(toJson(a[1])).to.equal(`1`);

    const b = /** @type [string, JsonNode] */ ((generator.next()).value);
    expect(b[0]).to.equal("b");
    expect(toJson(b[1])).to.equal(`2`);

    expect(generator.next().done).to.equal(true);
  });

  describe("the document", () => {
    test("is the AST as the root of a document, with its URL and comments", () => {
      const { document, errors } = fromJson(`[1] // c`, "https://example.com/doc", { allowComments: true });
      expect(document).to.include({ type: "json-document", status: "success", url: "https://example.com/doc" });
      expect(document.comments.map(({ value }) => value)).to.eql([" c"]);
      expect(toJson(document.children[0])).to.equal(`[1]`);
      expect(errors).to.eql([]);
    });

    test("has any parse status, with the errors next to it", () => {
      const { document, errors } = fromJson(`[1,]`, "https://example.com/doc");
      expect(document.status).to.equal("recovered");
      expect(errors.map(({ ruleId }) => ruleId)).to.eql(["trailing-comma"]);
    });

    test("its URL is the one its nodes' locations start with", () => {
      const { document } = fromJson(`1`, "HTTPS://Example.com");
      expect(document.url).to.equal("https://example.com/");
      expect(document.children[0].location).to.equal("https://example.com/#");
    });
  });

  describe("space", () => {
    const json = `{ "a": [1, { "b": 2 }] }`;

    test.each([
      ["a number of spaces", 4],
      ["more than 10 spaces", 12],
      ["a fraction of spaces", 2.7],
      ["no spaces", 0],
      ["a negative number of spaces", -1],
      ["a string longer than 10", "-".repeat(12)],
      ["an empty string", ""]
    ])("%s is like JSON.stringify", (_name, space) => {
      expect(toJson(parse(json), { space })).to.equal(JSON.stringify(JSON.parse(json), null, space));
    });
  });
});

/**
 * Parse JSON that's expected to be valid.
 *
 * @type (json: string) => JsonNode
 */
const parse = (json) => {
  const { document, errors } = fromJson(json, "https://example.com/doc");
  if (!hasStatus(document, "success")) {
    throw Error(jsonSyntaxErrorMessage(errors[0]));
  }
  return document.children[0];
};
