import { describe, test, expect } from "vitest";
import { Reference, jrefTypeOf } from "../jref/index.js";


describe("JRef - jrefTypeOf", () => {
  test("null", () => {
    expect(jrefTypeOf(null)).to.equal("null");
  });

  test("boolean - true", () => {
    expect(jrefTypeOf(true)).to.equal("boolean");
  });

  test("boolean - false", () => {
    expect(jrefTypeOf(true)).to.equal("boolean");
  });

  test("number", () => {
    expect(jrefTypeOf(42)).to.equal("number");
  });

  test("bigint", () => {
    expect(jrefTypeOf(42n)).to.equal("number");
  });

  test("string", () => {
    expect(jrefTypeOf("")).to.equal("string");
  });

  test("array", () => {
    expect(jrefTypeOf([])).to.equal("array");
  });

  test("object", () => {
    expect(jrefTypeOf({})).to.equal("object");
  });

  test("null prototype object", () => {
    expect(jrefTypeOf(Object.create(null))).to.equal("object");
  });

  test("reference", () => {
    expect(jrefTypeOf(new Reference("/"))).to.equal("reference");
  });

  test("undefined", () => {
    expect(jrefTypeOf(undefined)).to.equal("undefined");
  });

  test("symbol", () => {
    const subject = Symbol("test");
    expect(() => jrefTypeOf(subject)).to.throw(Error, "Not a JRef compatible type: symbol");
  });

  test("function", () => {
    const subject = () => true;
    expect(() => jrefTypeOf(subject)).to.throw(Error, "Not a JRef compatible type: function");
  });

  test("non-plain-object", () => {
    const subject = new Set();
    expect(() => jrefTypeOf(subject)).to.throw(Error, "Not a JRef compatible type: Set");
  });

  test("anonymous non-plain-object", () => {
    const subject = new class {}();
    expect(() => jrefTypeOf(subject)).to.throw(Error, "Not a JRef compatible type: anonymous");
  });
});
