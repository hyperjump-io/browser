import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, test, expect, beforeEach } from "vitest";
import { VFileMessage } from "vfile-message";
import {
  fromJson,
  toJson,
  rejson,
  rejsonStringify,
  jsonObjectHas,
  jsonArrayIter,
  jsonObjectKeys,
  jsonObjectValues,
  jsonObjectEntries,
  jsonValue,
  pointerStep,
  JsonPointerError
} from "./index.js";

/**
 * @import { JsonNode, JsonTolerantNode } from "./index.js"
 */

/**
 * Parse JSON that's expected to be valid.
 *
 * @type (json: string) => JsonNode
 */
const parse = (json) => {
  const result = fromJson(json);
  if (result.status !== "success") {
    throw result.messages[0];
  }
  return result.node;
};

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
      const node = parse(`["foo", 42]`);
      expect(() => jsonValue(node)).to.throw();
    });

    test("object", () => {
      const node = parse(`{ "foo": 42 }`);
      expect(() => jsonValue(node)).to.throw();
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

  describe("toJson replacer that removes values", () => {
    const json = `{ "a": [1, 2, 3], "b": { "c": 1, "d": 2 }, "d": 4 }`;

    /** @type JsonNode */
    const subject = parse(json);

    /** @type (key: string) => boolean */
    const isRemoved = (key) => key === "2" || key === "d";

    /** @type (node: JsonNode<unknown>, key?: string) => JsonNode<unknown> | undefined */
    const replacer = (node, key) => key !== undefined && isRemoved(key) ? undefined : node;

    /** @type (key: string, value: unknown) => unknown */
    const jsReplacer = (key, value) => isRemoved(key) ? undefined : value;

    test("without spaces", () => {
      const expected = JSON.stringify(JSON.parse(json), jsReplacer);
      expect(toJson(subject, replacer)).to.equal(expected);
    });

    test("with spaces", () => {
      const expected = JSON.stringify(JSON.parse(json), jsReplacer, "  ");
      expect(toJson(subject, replacer, "  ")).to.equal(expected);
    });

    test("all properties removed", () => {
      /** @type JsonNode */
      const node = parse(`{ "d": 1 }`);
      expect(toJson(node, replacer, "  ")).to.equal(`{}`);
    });
  });

  describe("pointerStep duplicate property names", () => {
    /** @type JsonNode */
    let subject;

    beforeEach(() => {
      subject = parse(`{ "foo": 1, "bar": 2, "foo": 3 }`);
    });

    test("stepping into a duplicated property fails", () => {
      expect(() => pointerStep("foo", subject)).to.throw(JsonPointerError);
    });

    test("stepping into a unique property in the same object works", () => {
      expect(toJson(pointerStep("bar", subject))).to.equal(`2`);
    });
  });

  describe("pointerStep array index", () => {
    /** @type JsonNode */
    let subject;

    beforeEach(() => {
      subject = parse(`[0, 1, 2]`);
    });

    test("valid index", () => {
      expect(toJson(pointerStep("1", subject))).to.equal(`1`);
    });

    test("zero", () => {
      expect(toJson(pointerStep("0", subject))).to.equal(`0`);
    });

    test("leading zero is not a valid index", () => {
      expect(() => pointerStep("01", subject)).to.throw(JsonPointerError);
    });

    test("trailing characters are not a valid index", () => {
      expect(() => pointerStep("1abc", subject)).to.throw(JsonPointerError);
    });

    test("negative numbers are not a valid index", () => {
      expect(() => pointerStep("-1", subject)).to.throw(JsonPointerError);
    });

    test("decimals are not a valid index", () => {
      expect(() => pointerStep("1.0", subject)).to.throw(JsonPointerError);
    });

    test("out of range", () => {
      expect(() => pointerStep("3", subject)).to.throw(JsonPointerError);
    });

    test("'-' refers to a nonexistent element", () => {
      expect(() => pointerStep("-", subject)).to.throw(JsonPointerError);
    });
  });

  test("a reviver can parse JSON while another parse is in progress", () => {
    const subject = fromJson(`["[1, 2]", 3]`, "", (node) => {
      if (node.jsonType === "string") {
        return /** @type JsonTolerantNode */ (fromJson(node.value).node);
      }
      return node;
    });

    expect(toJson(subject.node)).to.equal(`[[1,2],3]`);
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
    const message = fromJson(`{ "foo"\n\n  1 }`).messages[0];
    expect(message.reason).to.equal("Expected a colon");
    expect(message.place).to.eql({
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
