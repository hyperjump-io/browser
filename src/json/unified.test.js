import { describe, test, expect } from "vitest";
import { unified } from "unified";
import { VFileMessage } from "vfile-message";
import { toJson } from "./jsonast-util.js";
import { rejsonParse } from "./rejson-parse.js";
import { rejsonStringify } from "./rejson-stringify.js";
import { hasStatus } from "../jref/jref-util.js";
import { jrefParse } from "../jref/jref-parse.js";
import { jrefStringify } from "../jref/jref-stringify.js";

/**
 * @import { JsonErrorNode, JsonNode, JsonPropertyNode, JsonTolerantNode } from "./jsonast.d.ts"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 */

/**
 * @typedef {JsonTolerantNode | JsonErrorNode} TolerantValue
 */

/**
 * A file for a processor, which needs a path for the document's URL
 *
 * @type (value: string) => { path: string, value: string }
 */
const withPath = (value) => ({ path: "/doc.json", value });

const rejson = unified()
  .use(rejsonParse)
  .use(rejsonStringify)
  .freeze();
const jref = unified()
  .use(jrefParse)
  .use(jrefStringify)
  .freeze();

describe("JSONC in a processor", () => {
  test("the jref processor takes the flag", () => {
    const file = jref().use(jrefParse, { allowComments: true })
      .processSync(withPath(`{ "$ref": "foo" } // done`));

    expect(String(file)).toBe(`{"$ref":"foo"}\n`);
  });

  test("the rejson processor takes the flag", () => {
    const file = rejson().use(rejsonParse, { allowComments: true })
      .processSync(withPath(`{ "a": 1 } // done`));

    expect(String(file)).toBe(`{"a":1}\n`);
  });
});

describe("comments in a processor's AST", () => {
  test("are on the document from the rejson processor", () => {
    const document = rejson().use(rejsonParse, { allowComments: true })
      .parse(withPath(`// lint-ignore-next-line\n{ "a": 1 }`));

    expect(document.comments).toMatchObject([{ kind: "line", value: " lint-ignore-next-line" }]);
  });

  test("are on the document from the jref processor", () => {
    const document = jref().use(jrefParse, { allowComments: true })
      .parse(withPath(`{ "$ref": "foo" } // done`));

    expect(document.comments).toMatchObject([{ kind: "line", value: " done" }]);
  });

  test("the document has an empty list without the flag", () => {
    expect(rejson.parse(withPath(`1`)).comments).toEqual([]);
  });
});

describe("rejson processor", () => {
  test("fails on any syntax error by default", () => {
    try {
      rejson.processSync(withPath(`{ a: 1, "b": 2, }`));
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
      .processSync(withPath(`{ a: 1, "b": 2, }`));

    expect(file.messages.map((message) => message.ruleId)).toEqual(["property-key-not-quoted", "trailing-comma"]);
    expect(file.messages.every((message) => !message.fatal)).toBe(true);
    expect(String(file)).toBe(`{"a":1,"b":2}\n`);
  });

  test("accepting recovered parses still fails on a failure", () => {
    const processor = rejson().use(rejsonParse, { accept: "recovered" });

    expect(() => processor.processSync(withPath(`{ "a": }`))).toThrow(VFileMessage);
  });

  test("accepting failures always produces an AST with every error as a warning", () => {
    const processor = rejson().use(rejsonParse, { accept: "failure" });
    const tree = processor.parse(withPath(`{ "a": , "b": [1 }`));
    const file = processor.processSync(withPath(`{ "a": , "b": [1 }`));

    expect(tree.status).toBe("failure");
    expect(file.messages.map((message) => message.ruleId)).toEqual(["value-expected", "bracket-not-closed"]);
    expect(file.messages.every((message) => !message.fatal)).toBe(true);
  });

  test("the document has the parse status", () => {
    const processor = rejson().use(rejsonParse, { accept: "failure" });

    expect(processor.parse(withPath(`[1]`)).status).toBe("success");
    expect(processor.parse(withPath(`[1,]`)).status).toBe("recovered");
    expect(processor.parse(withPath(`[1,,]`)).status).toBe("failure");
  });

  test("a failed document has error nodes", () => {
    const document = rejson().use(rejsonParse, { accept: "failure" })
      .parse(withPath(`{ "a": `));

    expect(document.status).toBe("failure");
    expect(propertyNames(document.children[0])).toEqual(["a"]);
    expect(property(document.children[0], 0).children[1]).toMatchObject({ type: "json-missing" });
  });

  test("a valid document has no messages", () => {
    const file = rejson.processSync(withPath(`{ "a": 1 }`));

    expect(file.messages).toEqual([]);
  });

  test("a file without a path or a url fails, because it has no URL", () => {
    expect(() => rejson.parse(`{ "a": 1 }`)).toThrow(VFileMessage);
  });

  test("a file without a path has the url option's URL", () => {
    const tree = unified().use(rejsonParse, { url: "https://example.com/doc.json" })
      .parse(`{ "a": 1 }`);

    expect(tree.url).toBe("https://example.com/doc.json");
    expect(property(tree.children[0], 0).children[1].location).toBe("https://example.com/doc.json#/a");
  });

  test("a file with a path and a url fails", () => {
    const parse = () => unified().use(rejsonParse, { url: "https://example.com/doc.json" })
      .parse({ path: "/doc.json", value: `{}` });
    expect(parse).toThrow("can't have a 'url' option too");
  });

  test("a relative path is resolved against the file's cwd", () => {
    const tree = rejson.parse({ cwd: "/foo", path: "bar/main.json", value: `{ "a": 1 }` });

    expect(tree.url).toBe("file:///foo/bar/main.json");
    expect(property(tree.children[0], 0).children[1].location).toBe("file:///foo/bar/main.json#/a");
  });
});

describe("hasStatus", () => {
  const processor = rejson().use(rejsonParse, { accept: "failure" });

  test("is true when the document has one of the statuses", () => {
    expect(hasStatus(processor.parse(withPath(`[1,]`)), "success", "recovered")).toBe(true);
  });

  test("is false when the document has none of the statuses", () => {
    expect(hasStatus(processor.parse(withPath(`[1,,]`)), "success", "recovered")).toBe(false);
  });

  test("narrows a document's children to nodes without errors", () => {
    const document = processor.parse(withPath(`[1,]`));

    // @ts-expect-error Without narrowing, a child could be an error node
    /** @type JsonNode | undefined */ let child = document.children[0];

    if (hasStatus(document, "success", "recovered")) {
      child = document.children[0];
    }
    expect(child && toJson(child)).toBe(`[1]`);
  });

  test("narrows a JRef document's children", () => {
    const document = jref().use(jrefParse, { accept: "failure" })
      .parse(withPath(`{ "$ref": "foo", }`));

    if (!hasStatus(document, "success", "recovered")) {
      expect.fail("Expected the parse to recover");
    }

    /** @type JrefNode */
    const child = document.children[0];
    expect(child).toMatchObject({ type: "reference" });
  });

  test("the JRef version works for JSON documents too", () => {
    expect(hasStatus(processor.parse(withPath(`[1]`)), "success")).toBe(true);
  });
});

describe("the jref processor with errors", () => {
  test("the processor adds every syntax error to the file as a warning", () => {
    const file = jref().use(jrefParse, { accept: "recovered" })
      .processSync(withPath(`{ "$ref": "foo", }`));

    expect(file.messages.map((message) => message.ruleId)).toEqual(["trailing-comma"]);
    expect(file.messages.every((message) => !message.fatal)).toBe(true);
  });

  test("the processor fails on any syntax error by default", () => {
    expect(() => jref.processSync(withPath(`{ "$ref": "foo", }`))).toThrow(VFileMessage);
  });

  test("the document has the parse status", () => {
    const document = jref().use(jrefParse, { accept: "failure" })
      .parse(withPath(`{ "$ref": }`));

    expect(document.status).toBe("failure");
  });

  test("the processor fails the file with the message", () => {
    try {
      jref.processSync(withPath(`{ "$ref": "//[" }`));
      expect.fail("Expected a VFileMessage");
    } catch (error) {
      expect(error).toBeInstanceOf(VFileMessage);
      const message = /** @type VFileMessage */ (error);
      expect(message.reason).toBe("'//[' is not a valid reference");
      expect(message.source).toBe("jref");
      expect(message.ruleId).toBe("invalid-reference");
      expect(message.actual).toBe("//[");
      expect(message.line).toBe(1);
      expect(message.column).toBe(11);
    }
  });
});

describe("syntax errors as messages", () => {
  test("rejson syntax errors keep their position, source, and ruleId", () => {
    try {
      rejson.processSync({ path: "/doc.json", value: `{ "foo" 1 }` });
      expect.fail("Expected a VFileMessage");
    } catch (error) {
      expect(error).toBeInstanceOf(VFileMessage);
      const message = /** @type VFileMessage */ (error);
      expect(message.reason).toBe("Expected a colon");
      expect(message.line).toBe(1);
      expect(message.column).toBe(3);
      expect(message.source).toBe("json");
      expect(message.ruleId).toBe("colon-expected");
      expect(message.fatal).toBe(true);
    }
  });
});

/** @type (node: TolerantValue | undefined) => string[] */
const propertyNames = (node) => {
  return node && "jsonType" in node && node.jsonType === "object" ? node.children.map((property) => property.children[0].value) : [];
};

/** @type (node: TolerantValue | undefined, index: number) => JsonPropertyNode<{ type: "json" }, JsonErrorNode> */
const property = (node, index) => {
  if (!node || !("jsonType" in node) || node.jsonType !== "object") {
    throw Error("Expected an object");
  }
  return node.children[index];
};
