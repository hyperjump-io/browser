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

  it("string", () => {
    expect(jrefTypeOf("")).to.equal("string");
  });

  it("array", () => {
    expect(jrefTypeOf([])).to.equal("array");
  });

  it("object", () => {
    expect(jrefTypeOf({})).to.equal("object");
  });

  it("reference", () => {
    expect(jrefTypeOf(new Reference("/"))).to.equal("reference");
  });

  it("undefined", () => {
    expect(jrefTypeOf(undefined)).to.equal("undefined");
  });

  it("function should error", () => {
    const subject = () => true;
    expect(() => jrefTypeOf(subject)).to.throw(Error, "Not a JRef compatible type");
  });

  it("Set should error", () => {
    const subject = new Set();
    expect(() => jrefTypeOf(subject)).to.throw(Error, "Not a JRef compatible type");
  });
});
