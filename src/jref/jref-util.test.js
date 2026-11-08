import { describe, test, expect } from "vitest";
import { fromJref } from "./jref-util.js";
import { jsonStep, toJson } from "../json/jsonast-util.js";

/**
 * @import { IriReference } from "@hyperjump/uri"
 * @import { JrefNode } from "./jref-ast.d.ts"
 */

describe("JRef", () => {
  const testContext = "https://test.hyperjump.com";

  describe("parse", () => {
    describe("scalars", () => {
      test("null", () => {
        const subject = fromJref(`null`, testContext).node;
        expect(subject).to.eql({
          type: "json",
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
        const subject = fromJref(`true`, testContext).node;
        expect(subject).to.eql({
          type: "json",
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
        const subject = fromJref(`false`, testContext).node;
        expect(subject).to.eql({
          type: "json",
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
        const subject = fromJref(`1`, testContext).node;
        expect(subject).to.eql({
          type: "json",
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
        const subject = fromJref(`1.34`, testContext).node;
        expect(subject).to.eql({
          type: "json",
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
        const subject = fromJref(`-1.34`, testContext).node;
        expect(subject).to.eql({
          type: "json",
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
        const subject = fromJref(`-1e34`, testContext).node;
        expect(subject).to.eql({
          type: "json",
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
        const subject = fromJref(`{ "$ref": "./foo" }`, testContext).node;
        expect(subject).to.eql({
          type: "reference",
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
                  type: "json",
                  jsonType: "string",
                  value: "./foo",
                  location: `${testContext}#/$ref`,
                  position: {
                    start: { line: 1, column: 11, offset: 10 },
                    end: { line: 1, column: 18, offset: 17 }
                  }
                }
              ],
              position: {
                start: { line: 1, column: 3, offset: 2 },
                end: { line: 1, column: 18, offset: 17 }
              }
            }
          ],
          location: `${testContext}#`,
          href: "https://test.hyperjump.com/foo",
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 20, offset: 19 }
          }
        });
      });
    });

    describe("array", () => {
      test("empty", () => {
        const subject = fromJref(`[]`, testContext).node;
        expect(subject).to.eql({
          type: "json",
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
]`, testContext).node;
        expect(subject).to.eql({
          type: "json",
          jsonType: "array",
          children: [
            {
              type: "json",
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
]`, testContext).node;
        expect(subject).to.eql({
          type: "json",
          jsonType: "array",
          children: [
            {
              type: "reference",
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
                      type: "json",
                      jsonType: "string",
                      value: "./foo",
                      location: `${testContext}#/0/$ref`,
                      position: {
                        start: { line: 2, column: 13, offset: 14 },
                        end: { line: 2, column: 20, offset: 21 }
                      }
                    }
                  ],
                  position: {
                    start: { line: 2, column: 5, offset: 6 },
                    end: { line: 2, column: 20, offset: 21 }
                  }
                }
              ],
              location: `${testContext}#/0`,
              href: "https://test.hyperjump.com/foo",
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
        const subject = fromJref(`{}`, testContext).node;
        expect(subject).to.eql({
          type: "json",
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
}`, testContext).node;
        expect(subject).to.eql({
          type: "json",
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
                  type: "json",
                  jsonType: "number",
                  value: 42,
                  location: `${testContext}#/foo`,
                  position: {
                    start: { line: 2, column: 10, offset: 11 },
                    end: { line: 2, column: 12, offset: 13 }
                  }
                }
              ],
              position: {
                start: { line: 2, column: 3, offset: 4 },
                end: { line: 2, column: 12, offset: 13 }
              }
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
}`, testContext).node;
        expect(subject).to.eql({
          type: "json",
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
                  type: "reference",
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
                          type: "json",
                          jsonType: "string",
                          value: "./foo",
                          location: `${testContext}#/foo/$ref`,
                          position: {
                            start: { line: 2, column: 20, offset: 21 },
                            end: { line: 2, column: 27, offset: 28 }
                          }
                        }
                      ],
                      position: {
                        start: { line: 2, column: 12, offset: 13 },
                        end: { line: 2, column: 27, offset: 28 }
                      }
                    }
                  ],
                  location: `${testContext}#/foo`,
                  href: "https://test.hyperjump.com/foo",
                  position: {
                    start: { line: 2, column: 10, offset: 11 },
                    end: { line: 2, column: 29, offset: 30 }
                  }
                }
              ],
              position: {
                start: { line: 2, column: 3, offset: 4 },
                end: { line: 2, column: 29, offset: 30 }
              }
            }
          ],
          location: `${testContext}#`,
          position: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 3, column: 2, offset: 32 }
          }
        });
      });

      test("reference in the properties of a reference", () => {
        const subject = /** @type JrefNode */ (fromJref(`{ "$ref": "./foo", "bar": { "$ref": "./bar" } }`, testContext).node);
        expect(subject).to.include({ type: "reference", href: "https://test.hyperjump.com/foo" });
        expect(jsonStep("bar", subject)).to.include({ type: "reference", href: "https://test.hyperjump.com/bar" });
      });

      test("$ref that isn't a string", () => {
        const subject = fromJref(`{ "$ref": 42 }`, testContext).node;
        expect(subject).to.include({ type: "json" });
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
          value: null,
          location: /** @type IriReference */ ("#")
        };
        const subject = toJson(node);
        expect(subject).to.equal(`null`);
      });

      test("boolean", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "boolean",
          value: true,
          location: /** @type IriReference */ ("")
        };
        const subject = toJson(node);
        expect(subject).to.equal(`true`);
      });

      test("number", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "number",
          value: 42,
          location: /** @type IriReference */ ("")
        };
        const subject = toJson(node);
        expect(subject).to.equal(`42`);
      });

      test("reference", () => {
        /** @type JrefNode */
        const node = {
          type: "reference",
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
                  type: "json",
                  jsonType: "string",
                  value: "./foo",
                  location: /** @type IriReference */ ("#/$ref")
                }
              ]
            }
          ],
          location: /** @type IriReference */ ("#"),
          href: /** @type IriReference */ ("https://test.hyperjump.com/foo")
        };
        const subject = toJson(node);
        expect(subject).to.equal(`{"$ref":"./foo"}`);
      });
    });

    describe("array", () => {
      test("empty", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "array",
          children: [],
          location: /** @type IriReference */ ("#")
        };
        const subject = toJson(node);
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
              value: "foo",
              location: /** @type IriReference */ ("#/0")
            },
            {
              type: "json",
              jsonType: "number",
              value: 42,
              location: /** @type IriReference */ ("#/1")
            }
          ],
          location: /** @type IriReference */ ("#")
        };
        const subject = toJson(node);
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
              value: "foo",
              location: /** @type IriReference */ ("#/0")
            },
            {
              type: "reference",
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
                      type: "json",
                      jsonType: "string",
                      value: "./foo",
                      location: /** @type IriReference */ ("#/$ref")
                    }
                  ]
                }
              ],
              location: /** @type IriReference */ ("#/1"),
              href: /** @type IriReference */ ("https://test.hyperjump.com/foo")
            },
            {
              type: "json",
              jsonType: "number",
              value: 42,
              location: /** @type IriReference */ ("#/2")
            }
          ],
          location: /** @type IriReference */ ("#")
        };
        const subject = toJson(node);
        expect(subject).to.be.equal(`["foo",{"$ref":"./foo"},42]`);
      });
    });

    describe("object", () => {
      test("empty", () => {
        /** @type JrefNode */
        const node = {
          type: "json",
          jsonType: "object",
          children: [],
          location: /** @type IriReference */ ("#")
        };
        const subject = toJson(node);
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
                  jsonType: "string",
                  value: "foo"
                },
                {
                  type: "json",
                  jsonType: "number",
                  value: 42,
                  location: /** @type IriReference */ ("#/foo")
                }
              ]
            }
          ],
          location: /** @type IriReference */ ("#")
        };
        const subject = toJson(node);
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
                  jsonType: "string",
                  value: "foo"
                },
                {
                  type: "json",
                  jsonType: "number",
                  value: 42,
                  location: /** @type IriReference */ ("#/foo")
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
                  type: "reference",
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
                          type: "json",
                          jsonType: "string",
                          value: "./foo",
                          location: /** @type IriReference */ ("#/$ref")
                        }
                      ]
                    }
                  ],
                  location: /** @type IriReference */ ("#/bar"),
                  href: /** @type IriReference */ ("https://test.hyperjump.com/foo")
                }
              ]
            }
          ],
          location: /** @type IriReference */ ("#")
        };
        const subject = toJson(node);
        expect(subject).to.equal(`{"foo":42,"bar":{"$ref":"./foo"}}`);
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
                  jsonType: "string",
                  value: "foo"
                },
                {
                  type: "json",
                  jsonType: "number",
                  value: 42,
                  location: /** @type IriReference */ ("#/foo")
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
                  type: "reference",
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
                          type: "json",
                          jsonType: "string",
                          value: "./foo",
                          location: /** @type IriReference */ ("#/$ref")
                        }
                      ]
                    }
                  ],
                  href: /** @type IriReference */ ("https://test.hyperjump.com/foo"),
                  location: /** @type IriReference */ ("#/bar")
                }
              ]
            }
          ],
          location: /** @type IriReference */ ("#")
        };
        const subject = toJson(node, { space: "  " });
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
