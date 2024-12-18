import { describe, test, beforeAll, expect } from "vitest";
import { parse, stringify, Reference } from "./index.js";


const uri = "./foo";

describe("JRef", () => {
  describe("parse", () => {
    describe("scalars", () => {
      test("null", () => {
        const subject = parse(`null`);
        expect(subject).to.equal(null);
      });

      test("true", () => {
        const subject = parse(`true`);
        expect(subject).to.equal(true);
      });

      test("false", () => {
        const subject = parse(`false`);
        expect(subject).to.equal(false);
      });

      test("integers", () => {
        const subject = parse(`1`);
        expect(subject).to.equal(1);
      });

      test("real numbers", () => {
        const subject = parse(`1.34`);
        expect(subject).to.equal(1.34);
      });

      test("negative numbers", () => {
        const subject = parse(`-1.34`);
        expect(subject).to.equal(-1.34);
      });

      test("exponential numbers", () => {
        const subject = parse(`-1e34`);
        expect(subject).to.equal(-1e34);
      });

      test("reference", () => {
        const subject = parse(`{ "$ref": "${uri}" }`);
        expect(subject).to.eql(new Reference(uri));
      });
    });

    describe("array", () => {
      test("empty", () => {
        const subject = parse(`[]`);
        expect(subject).to.eql([]);
      });

      test("non-empty", () => {
        const subject = parse(`["foo", 42]`);
        expect(subject).to.eql(["foo", 42]);
      });

      test("reference", () => {
        const subject = parse(`["foo", { "$ref": "${uri}" }, 42]`);
        expect(subject).to.be.eql(["foo", new Reference(uri), 42]);
      });
    });

    describe("object", () => {
      test("empty", () => {
        const subject = parse(`{}`);
        expect(subject).to.eql({});
      });

      test("non-empty", () => {
        const subject = parse(`{ "foo": 42 }`);
        expect(subject).to.eql({ foo: 42 });
      });

      test("reference", () => {
        const subject = parse(`{ "foo": 42, "bar": { "$ref": "${uri}" } }`);
        expect(subject).to.be.eql({ foo: 42, bar: new Reference(uri) });
      });
    });

    describe("reviver", () => {
      test("convert properties that start with 'i' to integers", () => {
        const subject = parse(`{ "foo": 42, "iBar": "42", "baz": { "$ref": "${uri}" } }`, (key, value) => {
          return key.startsWith("i") && typeof value === "string" ? parseInt(value, 10) : value;
        });
        expect(subject).to.eql({ foo: 42, iBar: 42, baz: new Reference(uri) });
      });
    });
  });

  describe("stringify", () => {
    describe("scalars", () => {
      test("null", () => {
        const subject = stringify(null);
        expect(subject).to.equal(`null`);
      });

      test("true", () => {
        const subject = stringify(true);
        expect(subject).to.equal(`true`);
      });

      test("false", () => {
        const subject = stringify(false);
        expect(subject).to.equal(`false`);
      });

      test("integers", () => {
        const subject = stringify(1);
        expect(subject).to.equal(`1`);
      });

      test("real numbers", () => {
        const subject = stringify(1.34);
        expect(subject).to.equal(`1.34`);
      });

      test("negative numbers", () => {
        const subject = stringify(-1.34);
        expect(subject).to.equal(`-1.34`);
      });

      test("exponential numbers", () => {
        const subject = stringify(-1e34);
        expect(subject).to.equal(`-1e+34`);
      });

      test("reference", () => {
        const subject = stringify(new Reference(uri));
        expect(subject).to.equal(`{"$ref":"${uri}"}`);
      });
    });

    describe("array", () => {
      test("empty", () => {
        const subject = stringify([]);
        expect(subject).to.eql(`[]`);
      });

      test("non-empty", () => {
        const subject = stringify(["foo", 42]);
        expect(subject).to.eql(`["foo",42]`);
      });

      test("reference", () => {
        const subject = stringify(["foo", new Reference(uri), 42]);
        expect(subject).to.be.equal(`["foo",{"$ref":"${uri}"},42]`);
      });
    });

    describe("object", () => {
      test("empty", () => {
        const subject = stringify({});
        expect(subject).to.eql(`{}`);
      });

      test("non-empty", () => {
        const subject = stringify({ "foo": 42 });
        expect(subject).to.eql(`{"foo":42}`);
      });

      test("reference", () => {
        const subject = stringify({ foo: 42, bar: new Reference(uri) });
        expect(subject).to.equal(`{"foo":42,"bar":{"$ref":"${uri}"}}`);
      });
    });

    describe("replacer", () => {
      test("convert properties that start with 'i' to strings", () => {
        const subject = stringify({ foo: 42, iBar: 42, baz: new Reference(uri) }, (key, value) => {
          return key.startsWith("i") && typeof value === "number" ? String(value) : value;
        });
        expect(subject).to.equal(`{"foo":42,"iBar":"42","baz":{"$ref":"${uri}"}}`);
      });
    });

    describe("space", () => {
      test("pretty print", () => {
        const subject = stringify({ foo: 42, bar: new Reference(uri) }, null, "  ");
        expect(subject).to.equal(`{
  "foo": 42,
  "bar": {
    "$ref": "${uri}"
  }
}`);
      });
    });
  });

  describe("Reference", () => {
    describe("normal", () => {
      let subject: Reference;
      const uri = "https://example.com/foo";

      beforeAll(() => {
        subject = new Reference(uri);
      });

      test("$ref getter", () => {
        expect(subject.href).to.equal(uri);
      });

      test("to JSON", () => {
        expect(JSON.stringify(subject)).to.equal(`{"$ref":"${uri}"}`);
      });
    });

    describe("with value", () => {
      let subject: Reference;
      const uri = "https://example.com/foo";

      beforeAll(() => {
        subject = new Reference(uri, [uri]);
      });

      test("$ref getter", () => {
        expect(subject.href).to.equal(uri);
      });

      test("to JSON", () => {
        expect(JSON.stringify(subject)).to.eql(`["${uri}"]`);
      });
    });
  });
});
