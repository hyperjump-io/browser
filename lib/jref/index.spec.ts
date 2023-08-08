import { expect } from "chai";
import { parse, stringify, Reference } from "./index.js";


const uri = "./foo";

describe("JRef", () => {
  describe("parse", () => {
    describe("scalars", () => {
      it("null", () => {
        const subject = parse(`null`);
        expect(subject).to.equal(null);
      });

      it("true", () => {
        const subject = parse(`true`);
        expect(subject).to.equal(true);
      });

      it("false", () => {
        const subject = parse(`false`);
        expect(subject).to.equal(false);
      });

      it("integers", () => {
        const subject = parse(`1`);
        expect(subject).to.equal(1);
      });

      it("real numbers", () => {
        const subject = parse(`1.34`);
        expect(subject).to.equal(1.34);
      });

      it("negative numbers", () => {
        const subject = parse(`-1.34`);
        expect(subject).to.equal(-1.34);
      });

      it("exponential numbers", () => {
        const subject = parse(`-1e34`);
        expect(subject).to.equal(-1e34);
      });

      it("reference", () => {
        const subject = parse(`{ "$href": "${uri}" }`);
        expect(subject).to.eql(new Reference(uri));
      });
    });

    describe("array", () => {
      it("empty", () => {
        const subject = parse(`[]`);
        expect(subject).to.eql([]);
      });

      it("non-empty", () => {
        const subject = parse(`["foo", 42]`);
        expect(subject).to.eql(["foo", 42]);
      });

      it("reference", () => {
        const subject = parse(`["foo", { "$href": "${uri}" }, 42]`);
        expect(subject).to.be.eql(["foo", new Reference(uri), 42]);
      });
    });

    describe("object", () => {
      it("empty", () => {
        const subject = parse(`{}`);
        expect(subject).to.eql({});
      });

      it("non-empty", () => {
        const subject = parse(`{ "foo": 42 }`);
        expect(subject).to.eql({ foo: 42 });
      });

      it("reference", () => {
        const subject = parse(`{ "foo": 42, "bar": { "$href": "${uri}" } }`);
        expect(subject).to.be.eql({ foo: 42, bar: new Reference(uri) });
      });
    });

    describe("reviver", () => {
      it("convert properties that start with 'i' to integers", () => {
        const subject = parse(`{ "foo": 42, "iBar": "42", "baz": { "$href": "${uri}" } }`, (key, value) => {
          return key[0] === "i" && typeof value === "string" ? parseInt(value, 10) : value;
        });
        expect(subject).to.eql({ foo: 42, iBar: 42, baz: new Reference(uri) });
      });
    });
  });

  describe("stringify", () => {
    describe("scalars", () => {
      it("null", () => {
        const subject = stringify(null);
        expect(subject).to.equal(`null`);
      });

      it("true", () => {
        const subject = stringify(true);
        expect(subject).to.equal(`true`);
      });

      it("false", () => {
        const subject = stringify(false);
        expect(subject).to.equal(`false`);
      });

      it("integers", () => {
        const subject = stringify(1);
        expect(subject).to.equal(`1`);
      });

      it("real numbers", () => {
        const subject = stringify(1.34);
        expect(subject).to.equal(`1.34`);
      });

      it("negative numbers", () => {
        const subject = stringify(-1.34);
        expect(subject).to.equal(`-1.34`);
      });

      it("exponential numbers", () => {
        const subject = stringify(-1e34);
        expect(subject).to.equal(`-1e+34`);
      });

      it("reference", () => {
        const subject = stringify(new Reference(uri));
        expect(subject).to.equal(`{"$href":"${uri}"}`);
      });
    });

    describe("array", () => {
      it("empty", () => {
        const subject = stringify([]);
        expect(subject).to.eql(`[]`);
      });

      it("non-empty", () => {
        const subject = stringify(["foo", 42]);
        expect(subject).to.eql(`["foo",42]`);
      });

      it("reference", () => {
        const subject = stringify(["foo", new Reference(uri), 42]);
        expect(subject).to.be.equal(`["foo",{"$href":"${uri}"},42]`);
      });
    });

    describe("object", () => {
      it("empty", () => {
        const subject = stringify({});
        expect(subject).to.eql(`{}`);
      });

      it("non-empty", () => {
        const subject = stringify({ "foo": 42 });
        expect(subject).to.eql(`{"foo":42}`);
      });

      it("reference", () => {
        const subject = stringify({ foo: 42, bar: new Reference(uri) });
        expect(subject).to.equal(`{"foo":42,"bar":{"$href":"${uri}"}}`);
      });
    });

    describe("replacer", () => {
      it("convert properties that start with 'i' to strings", () => {
        const subject = stringify({ foo: 42, iBar: 42, baz: new Reference(uri) }, (key, value) => {
          return key[0] === "i" && typeof value === "number" ? String(value) : value;
        });
        expect(subject).to.equal(`{"foo":42,"iBar":"42","baz":{"$href":"${uri}"}}`);
      });
    });

    describe("space", () => {
      it("pretty print", () => {
        const subject = stringify({ foo: 42, bar: new Reference(uri) }, null, "  ");
        expect(subject).to.equal(`{
  "foo": 42,
  "bar": {
    "$href": "${uri}"
  }
}`);
      });
    });
  });

  describe("Reference", () => {
    describe("normal", () => {
      let subject: Reference;
      const uri = "https://example.com/foo";

      before(() => {
        subject = new Reference(uri);
      });

      it("href getter", () => {
        expect(subject.href).to.equal(uri);
      });

      it("to JSON", () => {
        expect(JSON.stringify(subject)).to.equal(`{"$href":"${uri}"}`);
      });
    });

    describe("with value", () => {
      let subject: Reference;
      const uri = "https://example.com/foo";

      before(() => {
        subject = new Reference(uri, [uri]);
      });

      it("href getter", () => {
        expect(subject.href).to.equal(uri);
      });

      it("to JSON", () => {
        expect(JSON.stringify(subject)).to.eql(`["${uri}"]`);
      });
    });
  });
});
