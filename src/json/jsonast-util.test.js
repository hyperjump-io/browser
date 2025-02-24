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
  jsonTypeOf,
  jsonArrayIter,
  jsonObjectKeys,
  jsonObjectValues,
  jsonObjectEntries,
  jsonValue
} from "./index.js";

/**
 * @import {
 *   JsonArrayNode,
 *   JsonBooleanNode,
 *   JsonNode,
 *   JsonNullNode,
 *   JsonNumberNode,
 *   JsonObjectNode,
 *   JsonStringNode
 * } from "./index.js"
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
      const node = fromJson(`null`);
      if (jsonTypeOf(node, "null")) {
        /** @type null */
        const subject = jsonValue(node);
        expect(subject).to.equal(null);
      } else {
        expect.fail();
      }
    });

    test("boolean", () => {
      const node = fromJson(`true`);
      if (jsonTypeOf(node, "boolean")) {
        /** @type boolean */
        const subject = jsonValue(node);
        expect(subject).to.equal(true);
      } else {
        expect.fail();
      }
    });

    test("number", () => {
      const node = fromJson(`42`);
      if (jsonTypeOf(node, "number")) {
        /** @type number */
        const subject = jsonValue(node);
        expect(subject).to.equal(42);
      } else {
        expect.fail();
      }
    });

    test("string", () => {
      const node = fromJson(`"foo"`);
      if (jsonTypeOf(node, "string")) {
        /** @type string */
        const subject = jsonValue(node);
        expect(subject).to.equal("foo");
      } else {
        expect.fail();
      }
    });

    test("array", () => {
      const node = fromJson(`["foo", 42]`);
      expect(jsonTypeOf(node, "array")).to.equal(true);
      expect(() => jsonValue(node)).to.throw();
    });

    test("object", () => {
      const node = fromJson(`{ "foo": 42 }`);
      expect(jsonTypeOf(node, "object")).to.equal(true);
      expect(() => jsonValue(node)).to.throw();
    });
  });

  describe("object has property", () => {
    /** @type JsonNode */
    let subject;

    beforeEach(() => {
      subject = fromJson(`{
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

  test("iter", () => {
    const subject = fromJson(`[1, 2]`);

    const generator = jsonArrayIter(subject);

    const first = generator.next();
    expect(toJson(first.value)).to.equal(`1`);
    const second = generator.next();
    expect(toJson(second.value)).to.equal(`2`);
    expect((generator.next()).done).to.equal(true);
  });

  test("keys", () => {
    const subject = fromJson(`{
      "a": 1,
      "b": 2
    }`);

    const generator = jsonObjectKeys(subject);

    expect(generator.next().value).to.equal("a");
    expect(generator.next().value).to.equal("b");
    expect(generator.next().done).to.equal(true);
  });

  test("values", () => {
    const subject = fromJson(`{
      "a": 1,
      "b": 2
    }`);

    const generator = jsonObjectValues(subject);

    const first = generator.next();
    expect(toJson(first.value)).to.equal(`1`);
    const second = generator.next();
    expect(toJson(second.value)).to.equal(`2`);
    expect((generator.next()).done).to.equal(true);
  });

  test("entries", () => {
    const subject = fromJson(`{
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
