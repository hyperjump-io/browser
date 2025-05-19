import { describe, test, expect } from "vitest";
import { fromJref } from "./jref-util.js";
import { resolveIri } from "@hyperjump/uri";
import { toJson } from "../json/jsonast-util.js";

/**
 * @import { JrefJrefNode } from "./jref-ast.d.ts"
 * @import { JsonNode } from "../json/jsonast.d.ts"
 */


describe("JRef", () => {
  const testContext = "https://test.hyperjump.com";

  describe("parse", () => {
    describe("scalars", () => {
      test("null", () => {
        const subject = fromJref(`null`, testContext);
        expect(subject).to.eql({
          type: "jref",
          jsonType: "null",
          value: null,
          location: `${testContext}#`,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 5, offset: 4 }
          }
        });
      });

      test("true", () => {
        const subject = fromJref(`true`, testContext);
        expect(subject).to.eql({
          type: "jref",
          jsonType: "boolean",
          value: true,
          location: `${testContext}#`,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 5, offset: 4 }
          }
        });
      });

      test("false", () => {
        const subject = fromJref(`false`, testContext);
        expect(subject).to.eql({
          type: "jref",
          jsonType: "boolean",
          value: false,
          location: `${testContext}#`,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 6, offset: 5 }
          }
        });
      });

      test("integers", () => {
        const subject = fromJref(`1`, testContext);
        expect(subject).to.eql({
          type: "jref",
          jsonType: "number",
          value: 1,
          location: `${testContext}#`,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 2, offset: 1 }
          }
        });
      });

      test("real numbers", () => {
        const subject = fromJref(`1.34`, testContext);
        expect(subject).to.eql({
          type: "jref",
          jsonType: "number",
          value: 1.34,
          location: `${testContext}#`,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 5, offset: 4 }
          }
        });
      });

      test("negative numbers", () => {
        const subject = fromJref(`-1.34`, testContext);
        expect(subject).to.eql({
          type: "jref",
          jsonType: "number",
          value: -1.34,
          location: `${testContext}#`,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 6, offset: 5 }
          }
        });
      });

      test("exponential numbers", () => {
        const subject = fromJref(`-1e34`, testContext);
        expect(subject).to.eql({
          type: "jref",
          jsonType: "number",
          value: -1e34,
          location: `${testContext}#`,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 6, offset: 5 }
          }
        });
      });

      test("reference", () => {
        const subject = fromJref(`{ "$ref": "./foo" }`, testContext);
        expect(subject).to.eql({
          type: "jref",
          jrefType: "jref-reference",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "$ref",
                  position: {
                    start: { line: 1, column: 3, offset: 2 },
                    end: { line: 1, column: 9, offset: 8 }
                  }
                },
                {
                  type: "jref",
                  jsonType: "string",
                  value: "./foo",
                  location: `${testContext}#/$ref`,
                  position: {
                    start: { line: 1, column: 11, offset: 10 },
                    end: { line: 1, column: 18, offset: 17 }
                  }
                }
              ]
            }
          ],
          location: `${testContext}#`,
          href: resolveIri("./foo", testContext),
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
          type: "jref",
          jsonType: "array",
          children: [],
          location: `${testContext}#`,
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
          type: "jref",
          jsonType: "array",
          children: [
            {
              type: "jref",
              jsonType: "string",
              value: "foo",
              location: `${testContext}#/0`,
              position: {
                start: { line: 2, column: 3, offset: 4 },
                end: { line: 2, column: 8, offset: 9 }
              }
            }
          ],
          location: `${testContext}#`,
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
          type: "jref",
          jsonType: "array",
          children: [
            {
              type: "jref",
              jrefType: "jref-reference",
              jsonType: "object",
              children: [
                {
                  type: "json-property",
                  children: [
                    {
                      type: "json-property-name",
                      jsonType: "string",
                      value: "$ref",
                      position: {
                        start: { line: 2, column: 5, offset: 6 },
                        end: { line: 2, column: 11, offset: 12 }
                      }
                    },
                    {
                      type: "jref",
                      jsonType: "string",
                      value: "./foo",
                      location: `${testContext}#/0/$ref`,
                      position: {
                        start: { line: 2, column: 13, offset: 14 },
                        end: { line: 2, column: 20, offset: 21 }
                      }
                    }
                  ]
                }
              ],
              location: `${testContext}#/0`,
              href: resolveIri("./foo", testContext),
              position: {
                start: { line: 2, column: 3, offset: 4 },
                end: { line: 2, column: 22, offset: 23 }
              }
            }
          ],
          location: `${testContext}#`,
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
          type: "jref",
          jsonType: "object",
          children: [],
          location: `${testContext}#`,
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
          type: "jref",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "foo",
                  position: {
                    start: { line: 2, column: 3, offset: 4 },
                    end: { line: 2, column: 8, offset: 9 }
                  }
                },
                {
                  type: "jref",
                  jsonType: "number",
                  value: 42,
                  location: `${testContext}#/foo`,
                  position: {
                    start: { line: 2, column: 10, offset: 11 },
                    end: { line: 2, column: 12, offset: 13 }
                  }
                }
              ]
            }
          ],
          location: `${testContext}#`,
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
          type: "jref",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "foo",
                  position: {
                    start: { line: 2, column: 3, offset: 4 },
                    end: { line: 2, column: 8, offset: 9 }
                  }
                },
                {
                  type: "jref",
                  jrefType: "jref-reference",
                  jsonType: "object",
                  children: [
                    {
                      type: "json-property",
                      children: [
                        {
                          type: "json-property-name",
                          jsonType: "string",
                          value: "$ref",
                          position: {
                            start: { line: 2, column: 12, offset: 13 },
                            end: { line: 2, column: 18, offset: 19 }
                          }
                        },
                        {
                          type: "jref",
                          jsonType: "string",
                          value: "./foo",
                          location: `${testContext}#/foo/$ref`,
                          position: {
                            start: { line: 2, column: 20, offset: 21 },
                            end: { line: 2, column: 27, offset: 28 }
                          }
                        }
                      ]
                    }
                  ],
                  location: `${testContext}#/foo`,
                  href: resolveIri("./foo", testContext),
                  position: {
                    start: { line: 2, column: 10, offset: 11 },
                    end: { line: 2, column: 29, offset: 30 }
                  }
                }
              ]
            }
          ],
          location: `${testContext}#`,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 3, column: 2, offset: 32 }
          }
        });
      });
    });

    describe("reviver", () => {
      test("convert properties that start with 'i' to integers", () => {
        const subject = fromJref(`{ "foo": 42, "iBar": "42", "baz": { "$ref": "./foo" } }`, testContext, (node, key) => {
          if (key?.startsWith("i") && node.jsonType === "string") {
            return {
              ...node,
              jsonType: "number",
              value: parseInt(node.value, 10)
            };
          } else {
            return node;
          }
        });
        expect(toJson(/** @type JsonNode<JrefJrefNode> */ (subject))).to.equal(`{"foo":42,"iBar":42,"baz":{"$ref":"./foo"}}`);
      });
    });
  });

  describe("stringify", () => {
    describe("scalars", () => {
      test("null", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jsonType: "null",
          value: null,
          location: "#"
        };
        const subject = toJson(node);
        expect(subject).to.equal(`null`);
      });

      test("boolean", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jsonType: "boolean",
          value: true,
          location: ""
        };
        const subject = toJson(node);
        expect(subject).to.equal(`true`);
      });

      test("number", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jsonType: "number",
          value: 42,
          location: ""
        };
        const subject = toJson(node);
        expect(subject).to.equal(`42`);
      });

      test("reference", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jrefType: "jref-reference",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "$ref"
                },
                {
                  type: "jref",
                  jsonType: "string",
                  value: "./foo",
                  location: "#/$ref"
                }
              ]
            }
          ],
          location: "#",
          href: resolveIri("./foo", testContext)
        };
        const subject = toJson(node);
        expect(subject).to.equal(`{"$ref":"./foo"}`);
      });
    });

    describe("array", () => {
      test("empty", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jsonType: "array",
          children: [],
          location: "#"
        };
        const subject = toJson(node);
        expect(subject).to.eql(`[]`);
      });

      test("non-empty", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jsonType: "array",
          children: [
            {
              type: "jref",
              jsonType: "string",
              value: "foo",
              location: "#/0"
            },
            {
              type: "jref",
              jsonType: "number",
              value: 42,
              location: "#/1"
            }
          ],
          location: "#"
        };
        const subject = toJson(node);
        expect(subject).to.eql(`["foo",42]`);
      });

      test("reference", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jsonType: "array",
          children: [
            {
              type: "jref",
              jsonType: "string",
              value: "foo",
              location: "#/0"
            },
            {
              type: "jref",
              jsonType: "object",
              children: [
                {
                  type: "json-property",
                  children: [
                    {
                      type: "json-property-name",
                      jsonType: "string",
                      value: "$ref"
                    },
                    {
                      type: "jref",
                      jsonType: "string",
                      value: "./foo",
                      location: "#/$ref"
                    }
                  ]
                }
              ],
              location: "#/1",
              href: resolveIri("./foo", testContext)
            },
            {
              type: "jref",
              jsonType: "number",
              value: 42,
              location: "#/2"
            }
          ],
          location: "#"
        };
        const subject = toJson(node);
        expect(subject).to.be.equal(`["foo",{"$ref":"./foo"},42]`);
      });
    });

    describe("object", () => {
      test("empty", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jsonType: "object",
          children: [],
          location: "#"
        };
        const subject = toJson(node);
        expect(subject).to.eql(`{}`);
      });

      test("non-empty", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "foo"
                },
                {
                  type: "jref",
                  jsonType: "number",
                  value: 42,
                  location: "#/foo"
                }
              ]
            }
          ],
          location: "#"
        };
        const subject = toJson(node);
        expect(subject).to.eql(`{"foo":42}`);
      });

      test("reference", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "foo"
                },
                {
                  type: "jref",
                  jsonType: "number",
                  value: 42,
                  location: "#/foo"
                }
              ]
            },
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "bar"
                },
                {
                  type: "jref",
                  jsonType: "object",
                  children: [
                    {
                      type: "json-property",
                      children: [
                        {
                          type: "json-property-name",
                          jsonType: "string",
                          value: "$ref"
                        },
                        {
                          type: "jref",
                          jsonType: "string",
                          value: "./foo",
                          location: "#/$ref"
                        }
                      ]
                    }
                  ],
                  location: "#/bar",
                  href: resolveIri("./foo", testContext)
                }
              ]
            }
          ],
          location: "#"
        };
        const subject = toJson(node);
        expect(subject).to.equal(`{"foo":42,"bar":{"$ref":"./foo"}}`);
      });
    });

    describe("replacer", () => {
      test("convert properties that start with 'i' to strings", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "foo"
                },
                {
                  type: "jref",
                  jsonType: "number",
                  value: 42,
                  location: "#/foo"
                }
              ]
            },
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "iBar"
                },
                {
                  type: "jref",
                  jsonType: "number",
                  value: 42,
                  location: "#/iBar"
                }
              ]
            },
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "baz"
                },
                {
                  type: "jref",
                  jsonType: "object",
                  children: [
                    {
                      type: "json-property",
                      children: [
                        {
                          type: "json-property-name",
                          jsonType: "string",
                          value: "$ref"
                        },
                        {
                          type: "jref",
                          jsonType: "string",
                          value: "./foo",
                          location: "#/$ref"
                        }
                      ]
                    }
                  ],
                  location: "#/baz",
                  href: resolveIri("./foo", testContext)
                }
              ]
            }
          ],
          location: "#"
        };
        const subject = toJson(node, (node, key) => {
          if (key?.startsWith("i") && node.jsonType === "number") {
            return {
              ...node,
              jsonType: "string",
              value: String(node.value)
            };
          } else {
            return node;
          }
        });
        expect(subject).to.equal(`{"foo":42,"iBar":"42","baz":{"$ref":"./foo"}}`);
      });
    });

    describe("space", () => {
      test("pretty print", () => {
        /** @type JrefJrefNode */
        const node = {
          type: "jref",
          jsonType: "object",
          children: [
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "foo"
                },
                {
                  type: "jref",
                  jsonType: "number",
                  value: 42,
                  location: "#/foo"
                }
              ]
            },
            {
              type: "json-property",
              children: [
                {
                  type: "json-property-name",
                  jsonType: "string",
                  value: "bar"
                },
                {
                  type: "jref",
                  jsonType: "object",
                  children: [
                    {
                      type: "json-property",
                      children: [
                        {
                          type: "json-property-name",
                          jsonType: "string",
                          value: "$ref"
                        },
                        {
                          type: "jref",
                          jsonType: "string",
                          value: "./foo",
                          location: "#/$ref"
                        }
                      ]
                    }
                  ],
                  location: "#/bar",
                  href: resolveIri("./foo", testContext)
                }
              ]
            }
          ],
          location: "#"
        };
        const subject = toJson(node, undefined, "  ");
        expect(subject).to.equal(`{
  "foo": 42,
  "bar": {
    "$ref": "./foo"
  }
}`);
      });
    });
  });
});
