import { describe, it, expect } from "vitest";
import { Reference, jrefTypeOf } from "../jref/index.js";


describe("JRef - jrefTypeOf", () => {
  it("null", () => {
    expect(jrefTypeOf(null)).to.equal("null");
  });

  it("boolean - true", () => {
    expect(jrefTypeOf(true)).to.equal("boolean");
  });

  it("boolean - false", () => {
    expect(jrefTypeOf(true)).to.equal("boolean");
  });

  it("number", () => {
    expect(jrefTypeOf(42)).to.equal("number");
  });

  it("bigint", () => {
    expect(jrefTypeOf(42n)).to.equal("number");
  });

  it("string", () => {
    expect(jrefTypeOf("")).to.equal("string");
  });

  it("array", () => {
    expect(jrefTypeOf([])).to.equal("array");
  });

  it("object", () => {
    expect(jrefTypeOf({})).to.equal("object");
  });

  it("null prototype object", () => {
    expect(jrefTypeOf(Object.create(null))).to.equal("object");
  });

  it("reference", () => {
    expect(jrefTypeOf(new Reference("/"))).to.equal("reference");
  });

  it("undefined", () => {
    expect(jrefTypeOf(undefined)).to.equal("undefined");
  });

  it("symbol", () => {
    const subject = Symbol("test");
    expect(() => jrefTypeOf(subject)).to.throw(Error, "Not a JRef compatible type: symbol");
  });

  it("function", () => {
    const subject = () => true;
    expect(() => jrefTypeOf(subject)).to.throw(Error, "Not a JRef compatible type: function");
  });

  it("non-plain-object", () => {
    const subject = new Set();
    expect(() => jrefTypeOf(subject)).to.throw(Error, "Not a JRef compatible type: Set");
  });

  it("anonymous non-plain-object", () => {
    const subject = new class {}();
    expect(() => jrefTypeOf(subject)).to.throw(Error, "Not a JRef compatible type: anonymous");
  });
});
