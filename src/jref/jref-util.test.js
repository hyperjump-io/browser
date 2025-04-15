import { describe, test, expect } from "vitest";
import { fromJref, toJref } from "./jref-util.js";
import { resolveIri } from "@hyperjump/uri";

/**
 * @import { JrefNode } from "./jref-ast.d.ts"
 * @import { Reviver } from "./jref-util.d.ts"
 */


describe("JRef", () => {
  const testContext = "https://test.hyperjump.com/";

  describe("parse", () => {
    describe("scalars", () => {
      test("null", () => {
        const subject = fromJref(`null`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "null",
          value: null,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 5, offset: 4 }
          }
        });
      });

      test("true", () => {
        const subject = fromJref(`true`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "boolean",
          value: true,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 5, offset: 4 }
          }
        });
      });

      test("false", () => {
        const subject = fromJref(`false`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "boolean",
          value: false,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 6, offset: 5 }
          }
        });
      });

      test("integers", () => {
        const subject = fromJref(`1`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "number",
          value: 1,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 2, offset: 1 }
          }
        });
      });

      test("real numbers", () => {
        const subject = fromJref(`1.34`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "number",
          value: 1.34,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 5, offset: 4 }
          }
        });
      });

      test("negative numbers", () => {
        const subject = fromJref(`-1.34`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "number",
          value: -1.34,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 6, offset: 5 }
          }
        });
      });

      test("exponential numbers", () => {
        const subject = fromJref(`-1e34`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "number",
          value: -1e34,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 6, offset: 5 }
          }
        });
      });

      test("reference", () => {
        const subject = fromJref(`{ "$ref": "./foo" }`, testContext);
        expect(subject).to.eql({
          type: "jref-reference",
          value: resolveIri("./foo", testContext),
          documentUri: testContext,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 20, offset: 19 }
          }
        });
      });
    });

    describe("array", () => {
      test("empty", () => {
        const subject = fromJref(`[]`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "array",
          children: [],
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 3, offset: 2 }
          }
        });
      });

      test("non-empty", () => {
        const subject = fromJref(`[
  "foo"
]`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "array",
          children: [
            {
              type: "json",
              jsonType: "string",
              value: "foo",
              position: {
                start: { line: 2, column: 3, offset: 4 },
                end: { line: 2, column: 8, offset: 9 }
              }
            }
          ],
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 3, column: 2, offset: 11 }
          }
        });
      });

      test("reference", () => {
        const subject = fromJref(`[
  { "$ref": "./foo" }
]`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "array",
          children: [
            {
              type: "jref-reference",
              value: resolveIri("./foo", testContext),
              documentUri: testContext,
              position: {
                start: { line: 2, column: 3, offset: 4 },
                end: { line: 2, column: 22, offset: 23 }
              }
            }
          ],
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 3, column: 2, offset: 25 }
          }
        });
      });
    });

    describe("object", () => {
      test("empty", () => {
        const subject = fromJref(`{}`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "object",
          children: [],
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 3, offset: 2 }
          }
        });
      });

      test("non-empty", () => {
        const subject = fromJref(`{
  "foo": 42
}`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  value: "foo",
                  position: {
                    start: { line: 2, column: 3, offset: 4 },
                    end: { line: 2, column: 8, offset: 9 }
                  }
                },
                {
                  type: "json",
                  jsonType: "number",
                  value: 42,
                  position: {
                    start: { line: 2, column: 10, offset: 11 },
                    end: { line: 2, column: 12, offset: 13 }
                  }
                }
              ]
            }
          ],
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 3, column: 2, offset: 15 }
          }
        });
      });

      test("reference", () => {
        const subject = fromJref(`{
  "foo": { "$ref": "./foo" }
}`, testContext);
        expect(subject).to.eql({
          type: "json",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  value: "foo",
                  position: {
                    start: { line: 2, column: 3, offset: 4 },
                    end: { line: 2, column: 8, offset: 9 }
                  }
                },
                {
                  type: "jref-reference",
                  value: resolveIri("./foo", testContext),
                  documentUri: testContext,
                  position: {
                    start: { line: 2, column: 10, offset: 11 },
                    end: { line: 2, column: 29, offset: 30 }
                  }
                }
              ]
            }
          ],
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 3, column: 2, offset: 32 }
          }
        });
      });
    });

    describe("reviver", () => {
      test("convert properties that start with 'i' to integers", () => {
        /** @type Reviver<JrefNode> */
        const reviver = (node, key) => {
          if (key?.startsWith("i") && node.type === "json" && node.jsonType === "string") {
            return {
              ...node,
              jsonType: "number",
              value: parseInt(node.value, 10)
            };
          } else {
            return node;
          }
        };
        const subject = fromJref(`{ "foo": 42, "iBar": "42", "baz": { "$ref": "./foo" } }`, testContext, reviver);
        expect(toJref(subject, testContext)).to.equal(`{"foo":42,"iBar":42,"baz":{"$ref":"foo"}}`);
      });
    });
  });

  describe("stringify", () => {
    describe("scalars", () => {
      test("null", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "null",
          value: null
        };
        const subject = toJref(node, testContext);
        expect(subject).to.equal(`null`);
      });

      test("boolean", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "boolean",
          value: true
        };
        const subject = toJref(node, testContext);
        expect(subject).to.equal(`true`);
      });

      test("number", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "number",
          value: 42
        };
        const subject = toJref(node, testContext);
        expect(subject).to.equal(`42`);
      });

      test("reference", () => {
        /** @type JrefNode */
        const node = {
          type: "jref-reference",
          value: resolveIri("./foo", testContext),
          documentUri: testContext
        };
        const subject = toJref(node, testContext);
        expect(subject).to.equal(`{"$ref":"foo"}`);
      });
    });

    describe("array", () => {
      test("empty", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "array",
          children: []
        };
        const subject = toJref(node, testContext);
        expect(subject).to.eql(`[]`);
      });

      test("non-empty", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "array",
          children: [
            {
              type: "json",
              jsonType: "string",
              value: "foo"
            },
            {
              type: "json",
              jsonType: "number",
              value: 42
            }
          ]
        };
        const subject = toJref(node, testContext);
        expect(subject).to.eql(`["foo",42]`);
      });

      test("reference", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "array",
          children: [
            {
              type: "json",
              jsonType: "string",
              value: "foo"
            },
            {
              type: "jref-reference",
              value: resolveIri("./foo", testContext),
              documentUri: testContext
            },
            {
              type: "json",
              jsonType: "number",
              value: 42
            }
          ]
        };
        const subject = toJref(node, testContext);
        expect(subject).to.be.equal(`["foo",{"$ref":"foo"},42]`);
      });
    });

    describe("object", () => {
      test("empty", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "object",
          children: []
        };
        const subject = toJref(node, testContext);
        expect(subject).to.eql(`{}`);
      });

      test("non-empty", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  value: "foo"
                },
                {
                  type: "json",
                  jsonType: "number",
                  value: 42
                }
              ]
            }
          ]
        };
        const subject = toJref(node, testContext);
        expect(subject).to.eql(`{"foo":42}`);
      });

      test("reference", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  value: "foo"
                },
                {
                  type: "json",
                  jsonType: "number",
                  value: 42
                }
              ]
            },
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  value: "bar"
                },
                {
                  type: "jref-reference",
                  value: resolveIri("./foo", testContext),
                  documentUri: testContext
                }
              ]
            }
          ]
        };
        const subject = toJref(node, testContext);
        expect(subject).to.equal(`{"foo":42,"bar":{"$ref":"foo"}}`);
      });
    });

    describe("replacer", () => {
      test("convert properties that start with 'i' to strings", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  value: "foo"
                },
                {
                  type: "json",
                  jsonType: "number",
                  value: 42
                }
              ]
            },
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  value: "iBar"
                },
                {
                  type: "json",
                  jsonType: "number",
                  value: 42
                }
              ]
            },
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  value: "baz"
                },
                {
                  type: "jref-reference",
                  value: resolveIri("./foo", testContext),
                  documentUri: testContext
                }
              ]
            }
          ]
        };
        const subject = toJref(node, testContext, (node, key) => {
          if (key?.startsWith("i") && node.type === "json" && node.jsonType === "number") {
            return {
              ...node,
              jsonType: "string",
              value: String(node.value)
            };
          } else {
            return node;
          }
        });
        expect(subject).to.equal(`{"foo":42,"iBar":"42","baz":{"$ref":"foo"}}`);
      });
    });

    describe("space", () => {
      test("pretty print", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  value: "foo"
                },
                {
                  type: "json",
                  jsonType: "number",
                  value: 42
                }
              ]
            },
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  value: "bar"
                },
                {
                  type: "jref-reference",
                  value: resolveIri("./foo", testContext),
                  documentUri: testContext
                }
              ]
            }
          ]
        };
        const subject = toJref(node, testContext, undefined, "  ");
        expect(subject).to.equal(`{
  "foo": 42,
  "bar": {
    "$ref": "foo"
  }
}`);
      });
    });
  });
});
