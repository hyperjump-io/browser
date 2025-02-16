import { describe, expect, test } from "vitest";
import { mimeMatch } from "./utilities.js";

describe("mimeMatch", () => {
  test("Exact match", () => {
    expect(mimeMatch("application/json", "application/json")).to.equal(true);
  });

  test("Type doesn't match", () => {
    expect(mimeMatch("application/xml", "text/xml")).to.equal(false);
  });

  test("Subtype doesn't match", () => {
    expect(mimeMatch("application/json", "application/xml")).to.equal(false);
  });

  test("Wildcard subtype", () => {
    expect(mimeMatch("application/*", "application/json")).to.equal(true);
  });

  test("Structured suffix subtype, exact match", () => {
    expect(mimeMatch("application/reference+json", "application/reference+json")).to.equal(true);
  });

  test("Structured suffix subtype, type doesn't match", () => {
    expect(mimeMatch("application/xml", "text/foo+xml")).to.equal(false);
  });

  test("Structured suffix subtype, subtype doesn't match", () => {
    expect(mimeMatch("application/reference+json", "application/schema+json")).to.equal(false);
  });

  test("Structured suffix subtype, subtype doesn't match", () => {
    expect(mimeMatch("application/json", "application/foo+xml")).to.equal(false);
  });

  test("Structured suffix subtype, subtype matches", () => {
    expect(mimeMatch("application/json", "application/reference+json")).to.equal(true);
  });

  test("Wildcard type, subtype matches", () => {
    expect(mimeMatch("*/xml", "application/xml")).to.equal(true);
  });

  test("Wildcard type, subtype doesn't match", () => {
    expect(mimeMatch("*/xml", "application/json")).to.equal(false);
  });

  test("Wildcard type, structured suffix subtype matches", () => {
    expect(mimeMatch("*/xml", "application/foo+xml")).to.equal(true);
  });

  test("Wildcard type, structured suffix subtype doesn't match", () => {
    expect(mimeMatch("*/xml", "application/reference+json")).to.equal(false);
  });

  test("Wildcard type, wildcard subtype", () => {
    expect(mimeMatch("*/*", "application/reference+json")).to.equal(true);
  });
});
