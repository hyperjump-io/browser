import { describe, test, expect } from "vitest";
import { VFileMessage } from "vfile-message";
import {
  fromJson,
  hasStatus,
  jsonArrayIter,
  jsonObjectEntries,
  jsonObjectHas,
  jsonObjectKeys,
  pointerGet,
  pointerStep,
  rejson,
  rejsonParse,
  toJson,
  JsonPointerError
} from "./index.js";
import { fromJref, hasStatus as jrefHasStatus, jref, jrefParse } from "../jref/index.js";

/**
 * @import { Position } from "unist"
 * @import {
 *   JsonDocumentNode,
 *   JsonErrorNode,
 *   JsonNode,
 *   JsonOptions,
 *   JsonPropertyNode,
 *   JsonTolerantNode
 * } from "./index.js"
 * @import { JrefNode } from "../jref/index.js"
 */

/**
 * @typedef {JsonTolerantNode | JsonErrorNode} TolerantValue
 */

/**
 * @typedef {{
 *   code: string | undefined;
 *   offset: number | undefined;
 *   length: number;
 *   found?: string;
 * }} TestError
 */

/** @type (message: VFileMessage) => TestError */
const toError = (message) => {
  const place = /** @type Position */ (message.place);
  /** @type TestError */
  const error = {
    code: message.ruleId,
    offset: place.start.offset,
    length: (place.end.offset ?? 0) - (place.start.offset ?? 0)
  };
  if (message.actual !== undefined) {
    error.found = message.actual;
  }
  return error;
};

/** @type (node: TolerantValue | undefined) => string[] */
const propertyNames = (node) => {
  return node && "jsonType" in node && node.jsonType === "object" ? node.children.map((property) => property.children[0].value) : [];
};

/**
 * The values of an array's items. Error nodes are shown as their type.
 *
 * @type (node: TolerantValue | undefined) => unknown[]
 */
const itemValues = (node) => {
  if (!node || !("jsonType" in node) || node.jsonType !== "array") {
    return [];
  }
  return node.children.map((item) => "value" in item ? item.value : item.type);
};

/** @type (node: TolerantValue | undefined, index: number) => JsonPropertyNode<{ type: "json" }, JsonErrorNode> */
const property = (node, index) => {
  if (!node || !("jsonType" in node) || node.jsonType !== "object") {
    throw Error("Expected an object");
  }
  return node.children[index];
};

/** @type (node: TolerantValue | undefined, index: number) => TolerantValue */
const item = (node, index) => {
  if (!node || !("jsonType" in node) || node.jsonType !== "array") {
    throw Error("Expected an array");
  }
  return node.children[index];
};

/** @type (json: string) => TolerantValue */
const tree = (json) => {
  return fromJson(json).node;
};

/** @type (node: { position?: Position }) => { offset: number | undefined, length: number } */
const span = (node) => {
  const position = /** @type Position */ (node.position);
  return {
    offset: position.start.offset,
    length: (position.end.offset ?? 0) - (position.start.offset ?? 0)
  };
};

/** @type (json: string, options?: JsonOptions) => { root: TolerantValue, errors: TestError[] } */
const parse = (json, options) => {
  const { node, messages } = fromJson(json, "", undefined, options);
  return { root: node, errors: messages.map(toError) };
};

describe("tolerant parse", () => {
  test("a valid document has no errors", () => {
    const { errors } = parse(`{ "a": 1 }`);

    expect(errors).toEqual([]);
  });

  test("a trailing comma in an object points at the comma", () => {
    const { errors } = parse(`{ "a": 1, }`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 8, length: 1 }
    ]);
  });

  test("a trailing comma in an array points at the comma", () => {
    const { errors } = parse(`[1, 2, ]`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 5, length: 1 }
    ]);
  });

  test("an unquoted property key points at the key", () => {
    const { errors } = parse(`{ a: 1 }`);

    expect(errors).toEqual([
      { code: "property-key-not-quoted", offset: 2, length: 1 }
    ]);
  });

  test("a single quoted property key points at the key", () => {
    const { errors } = parse(`{ 'a': 1 }`);

    expect(errors).toEqual([
      { code: "property-key-single-quoted", offset: 2, length: 3 }
    ]);
  });

  test("a single quoted string value points at the value", () => {
    const { errors } = parse(`{ "a": 'x' }`);

    expect(errors).toEqual([
      { code: "string-single-quoted", offset: 7, length: 3 }
    ]);
  });

  test("a missing comma points at the value it should follow", () => {
    const { errors } = parse(`{
      "a": 1
      "b": 2
    }`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 13, length: 1 }
    ]);
  });

  test("a missing colon points at the key it should follow", () => {
    const { errors } = parse(`{ "a" 1 }`);

    expect(errors).toEqual([
      { code: "colon-expected", offset: 2, length: 3 }
    ]);
  });

  test("a property name with nothing after it is missing both a colon and a value", () => {
    const { errors } = parse(`{"a"}`);

    expect(errors).toEqual([
      { code: "colon-expected", offset: 1, length: 3 },
      { code: "value-expected", offset: 1, length: 3 }
    ]);
  });

  test("a property with no value points at the colon rather than the next line", () => {
    const { errors } = parse(`{
      "a":
    }`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 11, length: 1 }
    ]);
  });

  test("an unclosed object points at its last property", () => {
    const { errors } = parse(`{
      "a": 1,
      "b": 2`);

    expect(errors).toEqual([
      { code: "brace-not-closed", offset: 22, length: 6 }
    ]);
  });

  test("an unclosed empty object points at the opening brace", () => {
    const { errors } = parse(`{`);

    expect(errors).toEqual([
      { code: "brace-not-closed", offset: 0, length: 1 }
    ]);
  });

  test("an unclosed array points at its last item", () => {
    const { errors } = parse(`{ "a": [1, 2 }`);

    expect(errors).toEqual([
      { code: "bracket-not-closed", offset: 11, length: 1 }
    ]);
  });

  test("an unclosed empty array points at the opening bracket", () => {
    const { errors } = parse(`{ "a": [ }`);

    expect(errors).toEqual([
      { code: "bracket-not-closed", offset: 7, length: 1 }
    ]);
  });

  test("an unterminated string points at the string", () => {
    const { errors } = parse(`{ "a": "x }`);

    expect(errors).toEqual([
      { code: "string-not-closed", offset: 7, length: 4 }
    ]);
  });

  test("an invalid escape points at the escape sequence", () => {
    const { errors } = parse(`{ "a": "x\\q" }`);

    expect(errors).toEqual([
      { code: "invalid-escape", offset: 9, length: 2 }
    ]);
  });

  test("an invalid unicode escape points at the escape sequence", () => {
    const { errors } = parse(`{ "a": "x\\u12G4" }`);

    expect(errors).toEqual([
      { code: "invalid-escape", offset: 9, length: 4 }
    ]);
  });

  test("an invalid unicode escape after a valid one points at the invalid one", () => {
    const { errors } = parse(`{ "a": "\\u0041\\uZZ" }`);

    expect(errors).toEqual([
      { code: "invalid-escape", offset: 14, length: 2 }
    ]);
  });

  test("a number with a leading zero is invalid", () => {
    const { errors } = parse(`{ "a": 01 }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 2, found: "01" }
    ]);
  });

  test("a padded number reports once across the whole run", () => {
    const { errors } = parse(`{ "a": 007 }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 3, found: "007" }
    ]);
  });

  test("a number with two decimal points reports once", () => {
    const { errors } = parse(`{ "a": 1.2.3 }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 5, found: "1.2.3" }
    ]);
  });

  test("hex notation is not a valid JSON number", () => {
    const { errors } = parse(`{ "a": 0x1F }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 4, found: "0x1F" }
    ]);
  });

  test("digit separators are not valid JSON numbers", () => {
    const { errors } = parse(`{ "a": 1_000 }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 5, found: "1_000" }
    ]);
  });

  test("NaN is reported as an invalid literal", () => {
    const { errors } = parse(`{ "a": NaN }`);

    expect(errors).toEqual([
      { code: "invalid-literal", offset: 7, length: 3, found: "NaN" }
    ]);
  });

  test("a capitalised boolean is reported as an invalid literal", () => {
    const { errors } = parse(`{ "a": True }`);

    expect(errors).toEqual([
      { code: "invalid-literal", offset: 7, length: 4, found: "True" }
    ]);
  });

  test("a control character inside a string points at the character", () => {
    const { errors } = parse(`{ "a": "x\ty" }`);

    expect(errors).toEqual([
      { code: "invalid-character", offset: 9, length: 1 }
    ]);
  });

  test("a number that stops after the decimal point is invalid", () => {
    const { errors } = parse(`{ "a": 1. }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 2, found: "1." }
    ]);
  });

  test("a number that stops after the exponent is invalid", () => {
    const { errors } = parse(`{ "a": 1e }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 2, found: "1e" }
    ]);
  });

  test("everything after the end of the document is reported", () => {
    const { errors } = parse(`{
      "a": 1
    }
    {
      "b": 2
    }`);

    expect(errors).toEqual([
      { code: "end-of-file-expected", offset: 25, length: 20 }
    ]);
  });

  test("trailing whitespace is not part of the content after the document", () => {
    const { errors } = parse(`{
      "a": 1
    }
    {
      "b": 2
    }
    `);

    expect(errors).toEqual([
      { code: "end-of-file-expected", offset: 25, length: 20 }
    ]);
  });
});

describe("recovery", () => {
  test("a trailing comma inside a nested object is reported once", () => {
    const { errors } = parse(`{
      "a": {
        "b": 1,
      }
    }`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 29, length: 1 }
    ]);
  });

  test("a trailing comma inside a nested array is reported once", () => {
    const { errors } = parse(`{ "a": [1, 2,], "b": 3 }`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 12, length: 1 }
    ]);
  });

  test("three mistakes in one object give three errors", () => {
    const { errors } = parse(`{
      a: 1,
      "b" 2,
      'c': 3
    }`);

    expect(errors).toEqual([
      { code: "property-key-not-quoted", offset: 8, length: 1 },
      { code: "colon-expected", offset: 20, length: 3 },
      { code: "property-key-single-quoted", offset: 33, length: 3 }
    ]);
  });

  test("a doubled comma between properties is reported once", () => {
    const { errors } = parse(`{ "a": 1,, "b": 2 }`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 8, length: 1 }
    ]);
  });

  test("a gap between array items is reported once", () => {
    const { errors } = parse(`[1, , 2]`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 2, length: 1 }
    ]);
  });

  test("each single quoted array item is reported separately", () => {
    const { errors } = parse(`['a', 'b']`);

    expect(errors).toEqual([
      { code: "string-single-quoted", offset: 1, length: 3 },
      { code: "string-single-quoted", offset: 6, length: 3 }
    ]);
  });

  test("an invalid number inside an array points at the number", () => {
    const { errors } = parse(`[01, 2]`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 1, length: 2, found: "01" }
    ]);
  });

  test("an invalid literal inside an array carries the text found", () => {
    const { errors } = parse(`[NaN, 1]`);

    expect(errors).toEqual([
      { code: "invalid-literal", offset: 1, length: 3, found: "NaN" }
    ]);
  });

  test("a number directly against a string is three separate mistakes", () => {
    const { errors } = parse(`{ "a": 1"b" }`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 7, length: 1 },
      { code: "colon-expected", offset: 8, length: 3 },
      { code: "value-expected", offset: 8, length: 3 }
    ]);
  });

  test("a missing value deep inside nested containers is reported once", () => {
    const { errors } = parse(`{
      "a": [
        {
          "b":
        }
      ]
    }`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 38, length: 1 }
    ]);
  });

  test("an unclosed outer object is reported once when the inner one closes", () => {
    const { errors } = parse(`{
      "a": {
        "b": 1
      }`);

    expect(errors).toEqual([
      { code: "brace-not-closed", offset: 8, length: 29 }
    ]);
  });

  test("an unterminated string that runs to the end of the document does not also report the containers", () => {
    const { errors } = parse(`{ "a": { "b": "x } }`);

    expect(errors).toEqual([
      { code: "string-not-closed", offset: 14, length: 6 }
    ]);
  });

  test("a mistake after a well formed nested object is still found", () => {
    const { errors } = parse(`{
      "a": {
        "b": 1
      },
      c: 2
    }`);

    expect(errors).toEqual([
      { code: "property-key-not-quoted", offset: 45, length: 1 }
    ]);
  });

  test("two trailing commas in different containers are both reported", () => {
    const { errors } = parse(`{
      "a": [1,],
      "b": {
        "c": 1,
      }
    }`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 15, length: 1 },
      { code: "trailing-comma", offset: 46, length: 1 }
    ]);
  });

  test("a truncated document reports every container left open", () => {
    const { errors } = parse(`{
      "a": {
        "b": {
          "c": [1, 2`);

    expect(errors).toEqual([
      { code: "brace-not-closed", offset: 8, length: 42 },
      { code: "brace-not-closed", offset: 23, length: 27 },
      { code: "brace-not-closed", offset: 40, length: 10 },
      { code: "bracket-not-closed", offset: 49, length: 1 }
    ]);
  });

  test("an unterminated string that ends at a newline does not hide a later unclosed array", () => {
    const { errors } = parse(`{
      "a": "x
      "b": [1, 2
    }`);

    expect(errors).toEqual([
      { code: "string-not-closed", offset: 13, length: 2 },
      { code: "comma-expected", offset: 13, length: 2 },
      { code: "bracket-not-closed", offset: 31, length: 1 }
    ]);
  });

  test("recovery keeps the rest of the tree usable", () => {
    const { root } = parse(`{
      a: 1,
      "b" 2,
      'c': 3
    }`);

    expect(propertyNames(root).length).toBe(3);
    expect(propertyNames(root)).toEqual(["a", "b", "c"]);
  });

  test("a property with no value does not take the next property's key as its value", () => {
    const { root, errors } = parse(`{
      "a":
      "b": 1,
      "c": 2
    }`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 11, length: 1 }
    ]);
    expect(propertyNames(root)).toEqual(["a", "b", "c"]);
  });

  test("a property missing its colon does not take the next property's key as its value", () => {
    const { root, errors } = parse(`{ "a" "b": 1, "c": 2 }`);

    expect(errors).toEqual([
      { code: "colon-expected", offset: 2, length: 3 },
      { code: "value-expected", offset: 2, length: 3 }
    ]);
    expect(propertyNames(root)).toEqual(["a", "b", "c"]);
  });

  test("a property with no value does not include the comma after it", () => {
    const { root } = parse(`{ "a": , "b": 1 }`);

    expect(span(property(root, 0))).toEqual({ offset: 2, length: 5 });
  });

  test("a property with no value does not include the closing brace", () => {
    const { root } = parse(`{ "a": }`);

    expect(span(property(root, 0))).toEqual({ offset: 2, length: 5 });
  });

  test("a property with no colon or value does not include the closing brace", () => {
    const { root } = parse(`{ "a" }`);

    expect(span(property(root, 0))).toEqual({ offset: 2, length: 4 });
  });

  test("a stray token in an array does not hide the items after it", () => {
    const { root, errors } = parse(`[1, : 2]`);

    expect(errors).toEqual([
      { code: "unexpected-token", offset: 4, length: 1, found: ":" }
    ]);
    expect(itemValues(root)).toEqual([1, 2]);
  });

  test("a stray token before a comma in an array is reported once", () => {
    const { root, errors } = parse(`[1, :, 2]`);

    expect(errors).toEqual([
      { code: "unexpected-token", offset: 4, length: 1, found: ":" }
    ]);
    expect(itemValues(root)).toEqual([1, 2]);
  });

  test("a stray token in a nested array does not hide the properties after it", () => {
    const { root, errors } = parse(`{ "a": [1, : 2], "b": 3 }`);

    expect(errors).toEqual([
      { code: "unexpected-token", offset: 11, length: 1, found: ":" }
    ]);
    expect(propertyNames(root)).toEqual(["a", "b"]);
  });

  test("a colon in place of a comma in an array is unexpected and leaves the comma missing", () => {
    const { root, errors } = parse(`[1 : 2]`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 1, length: 1 },
      { code: "unexpected-token", offset: 3, length: 1, found: ":" }
    ]);
    expect(itemValues(root)).toEqual([1, 2]);
  });

  test("consecutive stray tokens in an array are reported as one error", () => {
    const { root, errors } = parse(`[1, : : 2]`);

    expect(errors).toEqual([
      { code: "unexpected-token", offset: 4, length: 3, found: ": :" }
    ]);
    expect(itemValues(root)).toEqual([1, 2]);
  });

  test("a comma after skipped text is not an extra comma", () => {
    const { errors } = parse(`[1 :, 2]`);

    expect(errors).toEqual([
      { code: "unexpected-token", offset: 3, length: 1, found: ":" }
    ]);
  });

  test("a number used as a property key is an unquoted key", () => {
    const { root, errors } = parse(`{ 1: 2, "b": 3 }`);

    expect(errors).toEqual([
      { code: "property-key-not-quoted", offset: 2, length: 1 }
    ]);
    expect(propertyNames(root)).toEqual(["1", "b"]);
  });

  test("an invalid number used as a property key is only reported as an unquoted key", () => {
    const { errors } = parse(`{ 01: 2 }`);

    expect(errors).toEqual([
      { code: "property-key-not-quoted", offset: 2, length: 2 }
    ]);
  });

  test("a keyword used as a property key is an unquoted key", () => {
    const { root, errors } = parse(`{ true: 1 }`);

    expect(errors).toEqual([
      { code: "property-key-not-quoted", offset: 2, length: 4 }
    ]);
    expect(property(root, 0).children[0].value).toBe("true");
  });

  test("a keyword alone in an object is a key missing its colon and value", () => {
    const { root, errors } = parse(`{ true, "b": 1 }`);

    expect(errors).toEqual([
      { code: "property-key-not-quoted", offset: 2, length: 4 },
      { code: "colon-expected", offset: 2, length: 4 },
      { code: "value-expected", offset: 2, length: 4 }
    ]);
    expect(propertyNames(root)).toEqual(["true", "b"]);
  });

  test("a colon with no key is a property with an empty key", () => {
    const { root, errors } = parse(`{ "a": 1, : 2, "b": 3 }`);

    expect(errors).toEqual([
      { code: "property-key-expected", offset: 10, length: 1 }
    ]);
    expect(propertyNames(root)).toEqual(["a", "", "b"]);
    expect(property(root, 1).children[1]).toMatchObject({ value: 2 });
  });

  test("a colon in place of a comma in an object starts a property with an empty key", () => {
    const { root, errors } = parse(`{ "a": 1 : 2, "b": 3 }`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 7, length: 1 },
      { code: "property-key-expected", offset: 9, length: 1 }
    ]);
    expect(propertyNames(root)).toEqual(["a", "", "b"]);
  });

  test("a container with no key is the value of a property with an empty key", () => {
    const { root, errors } = parse(`{ "a": 1, { "x": 1 } }`);

    expect(errors).toEqual([
      { code: "property-key-expected", offset: 10, length: 1 }
    ]);
    expect(property(root, 1).children[0].value).toBe("");
    expect(property(root, 1).children[1]).toMatchObject({ jsonType: "object" });
  });

  test("a doubled colon is unexpected and the value after it is kept", () => {
    const { root, errors } = parse(`{ "a": : 1 }`);

    expect(errors).toEqual([
      { code: "unexpected-token", offset: 7, length: 1, found: ":" }
    ]);
    expect(property(root, 0).children[1]).toMatchObject({ value: 1 });
  });

  test("a doubled colon with no value reports the missing value at the first colon", () => {
    const { errors } = parse(`{ "a": : }`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 5, length: 1 },
      { code: "unexpected-token", offset: 7, length: 1, found: ":" }
    ]);
  });

  test("a comma-only array reports trailing-comma on the comma", () => {
    const { errors } = parse(`[,]`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 1, length: 1 }
    ]);
  });

  test("a deleted closing line produces minimal errors", () => {
    const { errors } = parse(`{
      "a": 1,
      "b": [
        2
      "c": 3
    }`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 37, length: 1 },
      { code: "bracket-not-closed", offset: 37, length: 1 }
    ]);
  });

  test("an unclosed array followed by a property produces minimal errors", () => {
    const { errors } = parse(`{
      "a": 1,
      "b": [ 2
      "c": 3
    }`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 29, length: 1 },
      { code: "bracket-not-closed", offset: 29, length: 1 }
    ]);
  });

  test("a comma-only object reports trailing-comma on the comma", () => {
    const { errors } = parse(`{,}`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 1, length: 1 }
    ]);
  });

  test("a leading comma in an array points at the bracket the value should follow", () => {
    const { errors } = parse(`[, 1]`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 0, length: 1 }
    ]);
  });

  test("an empty unclosed array followed by a property is reported once", () => {
    const { errors } = parse(`{
      "a": [
      "b": 1
    }`);

    expect(errors).toEqual([
      { code: "bracket-not-closed", offset: 13, length: 1 }
    ]);
  });

  test("nested unclosed arrays followed by a property report the missing comma once", () => {
    const { errors } = parse(`{
      "a": [
        [ 1
      "b": 2
    }`);

    expect(errors).toEqual([
      { code: "bracket-not-closed", offset: 23, length: 3 },
      { code: "comma-expected", offset: 25, length: 1 },
      { code: "bracket-not-closed", offset: 25, length: 1 }
    ]);
  });

  test("an unclosed array does not hide a later missing comma", () => {
    const { errors } = parse(`{ "x": { "a": [1 }, "b": 1 "c": 2 }`);

    expect(errors).toEqual([
      { code: "bracket-not-closed", offset: 15, length: 1 },
      { code: "comma-expected", offset: 25, length: 1 }
    ]);
  });

  test("a comment between a property name and its colon does not hide the property", () => {
    const { errors } = parse(`{
      "a": [ 1
      "b" /* x */: 2
    }`, { allowComments: true });

    expect(errors).toEqual([
      { code: "comma-expected", offset: 15, length: 1 },
      { code: "bracket-not-closed", offset: 15, length: 1 }
    ]);
  });
});

describe("comments", () => {
  test("a line comment is not allowed in JSON", () => {
    const { errors } = parse(`{
      // hi
      "a": 1
    }`);

    expect(errors).toEqual([
      { code: "comment-not-allowed", offset: 8, length: 5 }
    ]);
  });

  test("a block comment is not allowed in JSON", () => {
    const { errors } = parse(`{ /* hi */ "a": 1 }`);

    expect(errors).toEqual([
      { code: "comment-not-allowed", offset: 2, length: 8 }
    ]);
  });

  test("comments are allowed in JSONC", () => {
    const { errors } = parse(`{
      // hi
      "a": /* one */ 1
    }`, { allowComments: true });

    expect(errors).toEqual([]);
  });

  test("an unclosed block comment in JSONC is reported once", () => {
    const { errors } = parse(`{ "a": 1 /* hi }`, { allowComments: true });

    expect(errors).toEqual([
      { code: "comment-not-closed", offset: 9, length: 7 }
    ]);
  });

  test("an unclosed block comment in JSON is only reported as not allowed", () => {
    const { errors } = parse(`{ "a": 1 /* hi }`);

    expect(errors).toEqual([
      { code: "comment-not-allowed", offset: 9, length: 7 }
    ]);
  });

  test("a comment directly after a number does not make the number invalid", () => {
    const { errors } = parse(`{ "a": 1/* one */ }`, { allowComments: true });

    expect(errors).toEqual([]);
  });
});

describe("tolerant AST", () => {
  test("a property with no value has a zero width missing value after its colon", () => {
    const { root } = parse(`{ "a": }`);

    expect(property(root, 0).children[1]).toEqual({
      type: "json-missing",
      location: "#/a",
      position: {
        start: { line: 1, column: 7, offset: 6 },
        end: { line: 1, column: 7, offset: 6 }
      }
    });
  });

  test("a property with no value covers the whitespace where the value would go", () => {
    const { root } = parse(`{ "foo": `);

    expect(span(property(root, 0))).toEqual({ offset: 2, length: 7 });
    expect(span(property(root, 0).children[1])).toEqual({ offset: 8, length: 0 });
  });

  test("a property with no colon has a missing value after its name", () => {
    const { root } = parse(`{ "a" }`);

    expect(span(property(root, 0).children[1])).toEqual({ offset: 5, length: 0 });
  });

  test("a property with a value spans from its name to the end of its value", () => {
    const { root } = parse(`{ "a": [1, 2] }`);

    expect(span(property(root, 0))).toEqual({ offset: 2, length: 11 });
  });

  test("a property with no key has an empty name and its value is located under it", () => {
    const { root } = parse(`{ : 1 }`);

    expect(property(root, 0).children[1]).toMatchObject({ value: 1, location: "#/" });
  });

  test("a gap in an array is a missing item that keeps the items after it in place", () => {
    const { root } = parse(`[1, , 2]`);

    expect(itemValues(root)).toEqual([1, "json-missing", 2]);
    expect(root).toMatchObject({
      children: [
        { location: "#/0" },
        { type: "json-missing", location: "#/1" },
        { location: "#/2" }
      ]
    });
  });

  test("a gap is zero width and comes right after the comma before it", () => {
    const { root } = parse(`[1,   , 2]`);

    expect(root).toMatchObject({ children: [{}, { position: { start: { offset: 3 }, end: { offset: 3 } } }, {}] });
  });

  test("a leading comma is a gap at the start of an array", () => {
    expect(itemValues(tree(`[, 1]`))).toEqual(["json-missing", 1]);
  });

  test("a trailing comma isn't a gap", () => {
    expect(itemValues(tree(`[1, 2, ]`))).toEqual([1, 2]);
  });

  test("a comma alone in an array isn't a gap", () => {
    expect(itemValues(tree(`[,]`))).toEqual([]);
  });

  test("a doubled comma before the end of an array is a gap and a trailing comma", () => {
    const { root, errors } = parse(`[1,,]`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 2, length: 1 },
      { code: "trailing-comma", offset: 3, length: 1 }
    ]);
    expect(itemValues(root)).toEqual([1, "json-missing"]);
  });

  test("an unclosed object covers the whitespace after its last token", () => {
    const { root } = parse(`{ "a": 1\n\n  `);

    expect(root).toMatchObject({ jsonType: "object" });
    expect(span(root)).toEqual({ offset: 0, length: 12 });
  });

  test("an unclosed array followed by a property extends to the property", () => {
    const { root } = parse(`{ "a": [1, 2\n  "b": 3 }`);

    expect(span(property(root, 0).children[1])).toEqual({ offset: 7, length: 8 });
    expect(span(property(root, 0))).toEqual({ offset: 2, length: 13 });
  });

  test("an unclosed empty object covers the whitespace after its brace", () => {
    const { root } = parse(`{  `);

    expect(span(root)).toEqual({ offset: 0, length: 3 });
  });

  test("an unclosed container's error doesn't include the whitespace", () => {
    const { errors } = parse(`{ "a": [1, 2\n  "b": 3 }`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 11, length: 1 },
      { code: "bracket-not-closed", offset: 11, length: 1 }
    ]);
  });

  test("an unterminated string keeps what was typed", () => {
    const { root } = parse(`{ "a": "x\\n`);

    expect(property(root, 0).children[1]).toMatchObject({ jsonType: "string", value: "x\n" });
  });

  test("an invalid escape is kept as written", () => {
    const { root } = parse(`"a\\qb"`);

    expect(root).toMatchObject({ jsonType: "string", value: "a\\qb" });
  });

  test("a single quoted string has its quotes removed", () => {
    const { root } = parse(`{ 'a': 'it\\'s' }`);

    expect(propertyNames(root)).toEqual(["a"]);
    expect(property(root, 0).children[1]).toMatchObject({ jsonType: "string", value: "it's" });
  });

  test("an invalid literal is an invalid node with the text as written", () => {
    const { root } = parse(`[True]`);

    expect(root).toMatchObject({
      children: [
        {
          type: "json-invalid",
          raw: "True",
          location: "#/0",
          position: {
            start: { line: 1, column: 2, offset: 1 },
            end: { line: 1, column: 6, offset: 5 }
          }
        }
      ]
    });
  });

  test("an invalid number is an invalid node", () => {
    expect(tree(`1_000`)).toMatchObject({ type: "json-invalid", raw: "1_000" });
  });

  test("an empty document is a missing root", () => {
    const { root, errors } = parse(`  `);

    expect(root).toEqual({
      type: "json-missing",
      location: "#",
      position: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 }
      }
    });
    expect(errors).toEqual([
      { code: "value-expected", offset: 0, length: 0 }
    ]);
  });

  test("the reviver is applied to a tolerant AST", () => {
    const { node } = fromJson(`{ "a": 1, "b": , "c": [2 }`, "", (node) => {
      return node.jsonType === "number" ? { ...node, value: node.value * 10 } : node;
    });

    expect(toJson(node)).toBe(`{"a":10,"c":[20]}`);
  });

  test("the reviver isn't called for invalid or missing values", () => {
    /** @type string[] */
    const types = [];
    fromJson(`[NaN, , 1]`, "", (node) => {
      types.push(node.type);
      return node;
    });

    expect(types).toEqual(["json", "json"]);
  });

  test("errors have a line and column", () => {
    const { messages } = fromJson(`{\n  "a": 1,\n}`);

    expect(messages).toHaveLength(1);
    expect(messages[0].reason).toBe("Trailing commas are not allowed");
    expect(messages[0].place).toEqual({
      start: { line: 2, column: 9, offset: 10 },
      end: { line: 2, column: 10, offset: 11 }
    });
    expect(messages[0].source).toBe("json");
    expect(messages[0].ruleId).toBe("trailing-comma");
  });

  test("errors with found text include it as the actual value", () => {
    const { messages } = fromJson(`[True]`);

    expect(messages[0].reason).toBe("'True' is not a valid value");
    expect(messages[0].actual).toBe("True");
  });

  test("lines can end with CRLF", () => {
    const { messages } = fromJson(`{\r\n  "a": 1,\r\n}`);

    expect(messages[0].place).toMatchObject({ start: { line: 2, column: 9 } });
  });
});

describe("a container where a property name is expected", () => {
  test("in an object in an array, followed by the end of the array, is the next item", () => {
    const { root, errors } = parse(`[
  { "a": 1,
  { "b": 2 }
]`);

    expect(errors).toEqual([
      { code: "brace-not-closed", offset: 6, length: 6 }
    ]);
    expect(root).toMatchObject({ children: [{ jsonType: "object" }, { jsonType: "object", location: "#/1" }] });
    expect(propertyNames(item(root, 1))).toEqual(["b"]);
  });

  test("with no comma before it is also the next item", () => {
    const { root, errors } = parse(`[
  { "a": 1
  { "b": 2 }
]`);

    expect(errors).toEqual([
      { code: "brace-not-closed", offset: 6, length: 6 },
      { code: "comma-expected", offset: 11, length: 1 }
    ]);
    expect(itemValues(root)).toHaveLength(2);
  });

  test("followed by a comma and another value is the next item", () => {
    const { root, errors } = parse(`[{ "a": 1, { "b": 2 }, { "c": 3 }]`);

    expect(errors).toEqual([
      { code: "brace-not-closed", offset: 3, length: 6 }
    ]);
    expect(itemValues(root)).toHaveLength(3);
  });

  test("followed by the end of the object is the value of a property with no name", () => {
    const { root, errors } = parse(`[{ "a": 1, { "b": 2 } }]`);

    expect(errors).toEqual([
      { code: "property-key-expected", offset: 11, length: 1 }
    ]);
    expect(itemValues(root)).toHaveLength(1);
    expect(propertyNames(item(root, 0))).toEqual(["a", ""]);
  });

  test("followed by another property is the value of a property with no name", () => {
    const { root, errors } = parse(`[{ "a": 1, { "b": 2 }, "c": 3 }]`);

    expect(errors).toEqual([
      { code: "property-key-expected", offset: 11, length: 1 }
    ]);
    expect(propertyNames(item(root, 0))).toEqual(["a", "", "c"]);
  });

  test("in an object that isn't in an array is the value of a property with no name", () => {
    const { root } = parse(`{ "a": { "b": 1, { "c": 2 } ]`);

    expect(propertyNames(property(root, 0).children[1])).toEqual(["b", ""]);
  });
});

describe("nesting depth", () => {
  /** @type (depth: number) => string */
  const nested = (depth) => "[".repeat(depth) + "]".repeat(depth);

  test("1000 levels is allowed", () => {
    expect(parse(nested(1000)).errors).toEqual([]);
  });

  test("a container past 1000 levels is reported once and kept as an invalid node", () => {
    const { root, errors } = parse(`[${nested(1000)}, 1]`);

    expect(errors).toEqual([
      { code: "max-depth-exceeded", offset: 1000, length: 1 }
    ]);

    /** @type TolerantValue */
    let node = root;
    for (let level = 0; level < 1000; level++) {
      node = item(node, 0);
    }
    expect(node).toMatchObject({ type: "json-invalid", raw: "[]" });
  });

  test("parsing continues after a container that's too deep", () => {
    const { root } = parse(`[${nested(1000)}, 1]`);

    expect(itemValues(root)).toHaveLength(2);
    expect(item(root, 1)).toMatchObject({ value: 1, location: "#/1" });
  });

  test("very deep input doesn't overflow the stack", () => {
    const { errors } = parse(nested(100000));

    expect(errors).toEqual([
      { code: "max-depth-exceeded", offset: 1000, length: 1 }
    ]);
  });

  test("a container that's too deep is a failure", () => {
    expect(fromJson(nested(1001)).status).toBe("failure");
  });
});

describe("missing values in utilities", () => {
  const object = /** @type JsonTolerantNode */ (tree(`{ "a": 1, "b": }`));
  const array = /** @type JsonTolerantNode */ (tree(`[1, , 2]`));

  test("a property with a missing value is still a member of the object", () => {
    expect(jsonObjectHas("b", object)).toBe(true);
    expect([...jsonObjectKeys(object)]).toEqual(["a", "b"]);
  });

  test("a missing property value is undefined", () => {
    expect(pointerStep("b", object)).toBe(undefined);
    expect([...jsonObjectEntries(object)].map(([key, value]) => [key, value && toJson(value)])).toEqual([["a", "1"], ["b", undefined]]);
  });

  test("a missing array item is undefined", () => {
    expect(pointerStep("1", array)).toBe(undefined);
    expect([...jsonArrayIter(array)].map((item) => item && toJson(item))).toEqual(["1", undefined, "2"]);
  });

  test("the items after a gap keep their index", () => {
    expect(pointerStep("2", array)).toMatchObject({ value: 2 });
  });

  test("a property that doesn't exist is still an error", () => {
    expect(() => pointerStep("c", object)).toThrow(JsonPointerError);
  });

  test("a pointer can't go through a missing value", () => {
    expect(() => pointerGet("/b/c", object)).toThrow(JsonPointerError);
  });

  test("a missing property value is left out when stringified", () => {
    expect(toJson(object)).toBe(`{"a":1}`);
  });

  test("a missing array item is stringified as null", () => {
    expect(toJson(array)).toBe(`[1,null,2]`);
  });

  test("a missing root is stringified as an empty string", () => {
    expect(toJson(tree(``))).toBe(``);
  });
});

describe("invalid values in utilities", () => {
  const subject = /** @type JsonTolerantNode */ (tree(`{ "a": NaN }`));

  test("are returned as is", () => {
    expect(pointerStep("a", subject)).toMatchObject({ type: "json-invalid", raw: "NaN" });
  });

  test("a pointer can't go through an invalid value", () => {
    expect(() => pointerGet("/a/b", subject)).toThrow(JsonPointerError);
  });

  test("can't be stringified", () => {
    expect(() => toJson(subject)).toThrow(TypeError);
  });
});

describe("JSONC", () => {
  test("comments don't appear in the AST", () => {
    const { root } = parse(`[1, /* two */ 2] // done`, { allowComments: true });

    expect(itemValues(root)).toEqual([1, 2]);
  });

  test("a document with comments is a success with the flag", () => {
    const { status, node } = fromJson(`{ "a": 1 } // done`, "", undefined, { allowComments: true });

    expect(status).toBe("success");
    expect(toJson(node)).toBe(`{"a":1}`);
  });

  test("a document with comments is recovered without the flag", () => {
    expect(fromJson(`{ "a": 1 } // done`).status).toBe("recovered");
  });

  test("a comment marker inside a string isn't a comment", () => {
    const { root, errors } = parse(`["// not a comment", "/* nor this */"]`, { allowComments: true });

    expect(errors).toEqual([]);
    expect(itemValues(root)).toEqual(["// not a comment", "/* nor this */"]);
  });

  test("a comment can end at a CRLF line ending", () => {
    const { root, errors } = parse(`[1, // one\r\n2]`, { allowComments: true });

    expect(errors).toEqual([]);
    expect(itemValues(root)).toEqual([1, 2]);
  });

  test("fromJref takes the flag", () => {
    const { node } = fromJref(`{ "$ref": "foo" /* a reference */ }`, "https://example.com/main.jref", undefined, { allowComments: true });

    expect(node).toMatchObject({ type: "reference", href: "https://example.com/foo" });
  });

  test("fromJref reports no errors for comments with the flag", () => {
    const { messages } = fromJref(`[1] // done`, undefined, undefined, { allowComments: true });

    expect(messages).toEqual([]);
  });

  test("the jref processor takes the flag", () => {
    const file = jref().use(jrefParse, { allowComments: true })
      .processSync(`{ "$ref": "foo" } // done`);

    expect(String(file)).toBe(`{"$ref":"foo"}\n`);
  });

  test("the rejson processor takes the flag", () => {
    const file = rejson().use(rejsonParse, { allowComments: true })
      .processSync(`{ "a": 1 } // done`);

    expect(String(file)).toBe(`{"a":1}\n`);
  });
});

describe("comments in the AST", () => {
  test("are listed in document order with their kind, text, and position", () => {
    const { comments } = fromJson(`// first\n{ "a" /* second */: 1 }`, "", undefined, { allowComments: true });

    expect(comments).toEqual([
      {
        type: "json-comment",
        kind: "line",
        value: " first",
        position: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 9, offset: 8 }
        }
      },
      {
        type: "json-comment",
        kind: "block",
        value: " second ",
        position: {
          start: { line: 2, column: 7, offset: 15 },
          end: { line: 2, column: 19, offset: 27 }
        }
      }
    ]);
  });

  test("an unclosed block comment runs to the end of the document", () => {
    const { comments } = fromJson(`1 /* open`, "", undefined, { allowComments: true });

    expect(comments).toMatchObject([{ kind: "block", value: " open" }]);
  });

  test("aren't collected without the flag", () => {
    const { comments } = fromJson(`1 // one`);

    expect(comments).toEqual([]);
  });

  test("aren't children of any node", () => {
    const { node } = fromJson(`[1, /* two */ 2]`, "", undefined, { allowComments: true });

    expect(itemValues(node)).toEqual([1, 2]);
  });

  test("are on the document from the rejson processor", () => {
    const document = rejson().use(rejsonParse, { allowComments: true })
      .parse(`// lint-ignore-next-line\n{ "a": 1 }`);

    expect(document.comments).toMatchObject([{ kind: "line", value: " lint-ignore-next-line" }]);
  });

  test("are on the document from the jref processor", () => {
    const document = jref().use(jrefParse, { allowComments: true })
      .parse(`{ "$ref": "foo" } // done`);

    expect(document.comments).toMatchObject([{ kind: "line", value: " done" }]);
  });

  test("are returned with the AST", () => {
    const { node, comments } = fromJson(`// one\n[1]`, "", undefined, { allowComments: true });

    expect(toJson(node)).toBe(`[1]`);
    expect(comments).toMatchObject([{ kind: "line", value: " one" }]);
  });

  test("are returned with the AST when there's a reviver", () => {
    const { node, comments } = fromJson(`[1] /* one */`, "", (node) => node, { allowComments: true });

    expect(toJson(node)).toBe(`[1]`);
    expect(comments).toMatchObject([{ kind: "block", value: " one " }]);
  });

  test("are returned with the AST from a JRef parse", () => {
    const { node, comments } = fromJref(`{ "$ref": "foo" } // done`, "https://example.com/main.jref", undefined, { allowComments: true });

    expect(node).toMatchObject({ type: "reference" });
    expect(comments).toMatchObject([{ kind: "line", value: " done" }]);
  });

  test("are returned even when there are syntax errors", () => {
    const { status, comments } = fromJson(`[1,] // done`, "", undefined, { allowComments: true });

    expect(status).toBe("recovered");
    expect(comments).toMatchObject([{ value: " done" }]);
  });

  test("the document has an empty list without the flag", () => {
    expect(rejson.parse(`1`).comments).toEqual([]);
  });
});

describe("parse status", () => {
  test("valid input is a success", () => {
    const result = fromJson(`{ "a": [1, "two", null] }`);

    expect(result.status).toBe("success");
    expect(result.messages).toEqual([]);
  });

  test.each([
    ["a trailing comma", `[1, 2, ]`],
    ["a missing comma", `[1 2]`],
    ["a missing colon", `{ "a" 1 }`],
    ["an unquoted property name", `{ a: 1 }`],
    ["a single quoted property name", `{ 'a': 1 }`],
    ["a single quoted string", `['a']`],
    ["an unclosed object", `{ "a": 1`],
    ["an unclosed array", `[1, 2`],
    ["an unterminated string", `["a`],
    ["an invalid escape", `["a\\qb"]`],
    ["a control character in a string", `["a\tb"]`],
    ["a stray colon", `[1, : 2]`],
    ["a comment", `[1] // one`],
    ["an extra comma between properties", `{ "a": 1,, "b": 2 }`],
    ["an unclosed object followed by the next array item", `[{ "a": 1, { "b": 2 }]`]
  ])("%s is recovered", (_description, json) => {
    expect(fromJson(json).status).toBe("recovered");
  });

  test.each([
    ["an empty document", ``],
    ["a missing property value", `{ "a": }`],
    ["a gap in an array", `[1, , 2]`],
    ["an invalid literal", `[NaN]`],
    ["an invalid number", `[01]`],
    ["a missing property name", `{ : 1 }`],
    ["a container with no property name", `{ "a": 1, { "b": 2 } }`],
    ["content after the document", `[1] [2]`],
    ["a container that's too deep", "[".repeat(1001) + "]".repeat(1001)]
  ])("%s is a failure", (_description, json) => {
    expect(fromJson(json).status).toBe("failure");
  });

  test("a recoverable error doesn't hide a failure", () => {
    expect(fromJson(`[1, 2, ] [3]`).status).toBe("failure");
  });

  test("a recovered AST is typed without error nodes", () => {
    const result = fromJson(`{ a: 1 }`);
    if (result.status === "failure") {
      expect.fail("Expected the parse to recover");
    }

    /** @type JsonNode */
    const node = result.node;
    expect(toJson(node)).toBe(`{"a":1}`);
  });
});

describe("rejson processor", () => {
  test("fails on any syntax error by default", () => {
    try {
      rejson.processSync(`{ a: 1, "b": 2, }`);
      expect.fail("Expected a VFileMessage");
    } catch (error) {
      expect(error).toBeInstanceOf(VFileMessage);
      const message = /** @type VFileMessage */ (error);
      expect(message.ruleId).toBe("property-key-not-quoted");
      expect(message.fatal).toBe(true);
    }
  });

  test("accepting recovered parses adds every syntax error to the file as a warning", () => {
    const file = rejson().use(rejsonParse, { accept: "recovered" })
      .processSync(`{ a: 1, "b": 2, }`);

    expect(file.messages.map((message) => message.ruleId)).toEqual(["property-key-not-quoted", "trailing-comma"]);
    expect(file.messages.every((message) => !message.fatal)).toBe(true);
    expect(String(file)).toBe(`{"a":1,"b":2}\n`);
  });

  test("accepting recovered parses still fails on a failure", () => {
    const processor = rejson().use(rejsonParse, { accept: "recovered" });

    expect(() => processor.processSync(`{ "a": }`)).toThrow(VFileMessage);
  });

  test("accepting failures always produces an AST with every error as a warning", () => {
    const processor = rejson().use(rejsonParse, { accept: "failure" });
    const tree = processor.parse(`{ "a": , "b": [1 }`);
    const file = processor.processSync(`{ "a": , "b": [1 }`);

    expect(tree.status).toBe("failure");
    expect(file.messages.map((message) => message.ruleId)).toEqual(["value-expected", "bracket-not-closed"]);
    expect(file.messages.every((message) => !message.fatal)).toBe(true);
  });

  test("the document has the parse status", () => {
    const processor = rejson().use(rejsonParse, { accept: "failure" });

    expect(processor.parse(`[1]`).status).toBe("success");
    expect(processor.parse(`[1,]`).status).toBe("recovered");
    expect(processor.parse(`[1,,]`).status).toBe("failure");
  });

  test("a failed document has error nodes", () => {
    const document = rejson().use(rejsonParse, { accept: "failure" })
      .parse(`{ "a": `);

    expect(document.status).toBe("failure");
    expect(propertyNames(document.children[0])).toEqual(["a"]);
    expect(property(document.children[0], 0).children[1]).toMatchObject({ type: "json-missing" });
  });

  test("a valid document has no messages", () => {
    const file = rejson.processSync(`{ "a": 1 }`);

    expect(file.messages).toEqual([]);
  });
});

describe("hasStatus", () => {
  const processor = rejson().use(rejsonParse, { accept: "failure" });

  test("is true when the document has one of the statuses", () => {
    expect(hasStatus(processor.parse(`[1,]`), "success", "recovered")).toBe(true);
  });

  test("is false when the document has none of the statuses", () => {
    expect(hasStatus(processor.parse(`[1,,]`), "success", "recovered")).toBe(false);
  });

  test("narrows a document's children to nodes without errors", () => {
    const document = processor.parse(`[1,]`);

    // @ts-expect-error Without narrowing, a child could be an error node
    /** @type JsonNode | undefined */ let child = document.children[0];

    if (hasStatus(document, "success", "recovered")) {
      child = document.children[0];
    }
    expect(child && toJson(child)).toBe(`[1]`);
  });

  test("narrows a JRef document's children", () => {
    const document = jref().use(jrefParse, { accept: "failure" })
      .parse(`{ "$ref": "foo", }`);

    if (!jrefHasStatus(document, "success", "recovered")) {
      expect.fail("Expected the parse to recover");
    }

    /** @type JrefNode */
    const child = document.children[0];
    expect(child).toMatchObject({ type: "reference" });
  });

  test("the JRef version works for JSON documents too", () => {
    expect(jrefHasStatus(processor.parse(`[1]`), "success")).toBe(true);
  });
});

describe("jref with errors", () => {
  test("a $ref without a value isn't a reference", () => {
    const { node, messages } = fromJref(`{ "$ref": }`, "https://example.com/main.jref");

    expect(node).toMatchObject({ type: "json", jsonType: "object" });
    expect(messages.map((message) => message.ruleId)).toEqual(["value-expected"]);
  });

  test("references are still found around errors", () => {
    const { node } = fromJref(`[{ "$ref": "foo" }, , ]`, "https://example.com/main.jref");

    expect(node).toMatchObject({
      jsonType: "array",
      children: [{ type: "reference", href: "https://example.com/foo" }, { type: "json-missing" }]
    });
  });

  test("the processor adds every syntax error to the file as a warning", () => {
    const file = jref().use(jrefParse, { accept: "recovered" })
      .processSync(`{ "$ref": "foo", }`);

    expect(file.messages.map((message) => message.ruleId)).toEqual(["trailing-comma"]);
    expect(file.messages.every((message) => !message.fatal)).toBe(true);
  });

  test("the processor fails on any syntax error by default", () => {
    expect(() => jref.processSync(`{ "$ref": "foo", }`)).toThrow(VFileMessage);
  });

  test("the document has the parse status", () => {
    const document = jref().use(jrefParse, { accept: "failure" })
      .parse(`{ "$ref": }`);

    expect(document.status).toBe("failure");
  });
});
