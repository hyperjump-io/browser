import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { describe, test, expect, beforeEach } from "vitest";
import { unified } from "unified";
import { VFileMessage } from "vfile-message";
import {
  fromJson,
  jsonSyntaxErrorMessage,
  toJson,
  rejsonParse,
  rejsonStringify,
  jsonObjectHas,
  jsonArrayIter,
  jsonObjectKeys,
  jsonObjectValues,
  jsonObjectEntries,
  jsonValue,
  jsonPointerGet,
  jsonStep,
  JsonPointerError
} from "../hyperjump/index.js";

const rejson = unified()
  .use(rejsonParse)
  .use(rejsonStringify)
  .freeze();

/**
 * @import { JsonNode, JsonTolerantNode } from "../hyperjump/index.js"
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
      test(`${entry.name.substring(2)} without spaces`, async () => {
        const processed = await rejson()
          .process(json);
        const expected = JSON.stringify(JSON.parse(json)) + "\n";
        expect(processed.toString()).to.eql(expected);
      });

      test(`${entry.name.substring(2)} with spaces`, async () => {
        const processed = await rejson()
          .use(rejsonStringify, { space: "  " })
          .process(json);
        const expected = JSON.stringify(JSON.parse(json), null, "  ") + "\n";
        expect(processed.toString()).to.eql(expected);
      });
    } else if (entry.name.startsWith("n_")) {
      test(entry.name.substring(2), () => {
        expect(() => rejson.processSync(json)).to.throw(VFileMessage);
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

    test("a '__proto__' property is an own property, not the prototype", () => {
      const node = parse(`{ "__proto__": { "isAdmin": true } }`);
      const subject = /** @type Record<string, unknown> */ (jsonValue(node));
      expect(Object.getPrototypeOf(subject)).to.equal(Object.prototype);
      expect(Object.hasOwn(subject, "__proto__")).to.equal(true);
      expect(subject).to.eql(JSON.parse(`{ "__proto__": { "isAdmin": true } }`));
    });

    test("values that couldn't be parsed", () => {
      const node = /** @type JsonNode */ (fromJson(`{ "foo": , "bar": [1, , NaN, 2], "baz": True }`).node);
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
      expect(() => jsonStep("foo", subject)).to.throw(JsonPointerError);
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
      expect(() => jsonStep("01", subject)).to.throw(JsonPointerError);
    });

    test("trailing characters are not a valid index", () => {
      expect(() => jsonStep("1abc", subject)).to.throw(JsonPointerError);
    });

    test("negative numbers are not a valid index", () => {
      expect(() => jsonStep("-1", subject)).to.throw(JsonPointerError);
    });

    test("decimals are not a valid index", () => {
      expect(() => jsonStep("1.0", subject)).to.throw(JsonPointerError);
    });

    test("out of range", () => {
      expect(() => jsonStep("3", subject)).to.throw(JsonPointerError);
    });

    test("'-' refers to a nonexistent element", () => {
      expect(() => jsonStep("-", subject)).to.throw(JsonPointerError);
    });
  });

  describe("JSON Pointer error messages", () => {
    test("say the location from the node", () => {
      const subject = /** @type JsonTolerantNode */ (fromJson(`{ "a": { "b": 1 } }`, "https://example.com/doc").node);
      expect(() => jsonPointerGet("/a/c", subject)).to.throw(JsonPointerError, "Property 'c' doesn't exist at https://example.com/doc#/a/c");
    });

    test("say the location of a missing value", () => {
      const subject = /** @type JsonTolerantNode */ (fromJson(`{ "a": }`, "https://example.com/doc").node);
      expect(() => jsonPointerGet("/a/b", subject)).to.throw(JsonPointerError, "Can't index into a missing value at https://example.com/doc#/a");
    });

    test("say the location of a missing root", () => {
      const subject = /** @type JsonTolerantNode */ (fromJson(``, "https://example.com/doc").node);
      expect(() => jsonPointerGet("/a", subject)).to.throw(JsonPointerError, "Can't index into a missing value at https://example.com/doc#");
    });

    test("say the location of an invalid value", () => {
      const subject = /** @type JsonTolerantNode */ (fromJson(`{ "a": NaN }`, "https://example.com/doc").node);
      expect(() => jsonPointerGet("/a/b", subject)).to.throw(JsonPointerError, "Can't index into an invalid value at https://example.com/doc#/a");
    });

    test("say a file URL relative to the working directory", () => {
      const subject = /** @type JsonTolerantNode */ (fromJson(`{}`, `${pathToFileURL(cwd()).href}/data/a.json`).node);
      expect(() => jsonPointerGet("/a", subject)).to.throw(JsonPointerError, "Property 'a' doesn't exist at data/a.json#/a");
    });

    test("say only the fragment without a document URI", () => {
      const subject = parse(`[]`);
      expect(() => jsonStep("0", subject)).to.throw(JsonPointerError, "Index '0' doesn't exist at #/0");
    });
  });

  test("rejson syntax errors keep their position, source, and ruleId", () => {
    try {
      rejson.processSync(`{ "foo" 1 }`);
      expect.fail("Expected a VFileMessage");
    } catch (error) {
      expect(error).to.be.instanceof(VFileMessage);
      const message = /** @type VFileMessage */ (error);
      expect(message.reason).to.equal("Expected a colon");
      expect(message.line).to.equal(1);
      expect(message.column).to.equal(3);
      expect(message.source).to.equal("json");
      expect(message.ruleId).to.equal("colon-expected");
      expect(message.fatal).to.equal(true);
    }
  });

  test("missing colon error points at the property name it should follow", () => {
    const error = fromJson(`{ "foo"\n\n  1 }`).errors[0];
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
});

/**
 * Parse JSON that's expected to be valid.
 *
 * @type (json: string) => JsonNode
 */
const parse = (json) => {
  const result = fromJson(json);
  if (result.status !== "success") {
    throw Error(jsonSyntaxErrorMessage(result.errors[0]));
  }
  return result.node;
};
