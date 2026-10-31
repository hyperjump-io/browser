import { describe, expect, test } from "vitest";
import { mimeMatchSpecificity } from "./utilities.js";

describe("mimeMatchSpecificity matches", () => {
  test("Exact match", () => {
    expect(mimeMatchSpecificity("application/json", "application/json")).to.be.greaterThan(0);
  });

  test("Type doesn't match", () => {
    expect(mimeMatchSpecificity("application/xml", "text/xml")).to.equal(0);
  });

  test("Subtype doesn't match", () => {
    expect(mimeMatchSpecificity("application/json", "application/xml")).to.equal(0);
  });

  test("Wildcard subtype", () => {
    expect(mimeMatchSpecificity("application/*", "application/json")).to.be.greaterThan(0);
  });

  test("Structured suffix subtype, exact match", () => {
    expect(mimeMatchSpecificity("application/reference+json", "application/reference+json")).to.be.greaterThan(0);
  });

  test("Structured suffix subtype, type doesn't match", () => {
    expect(mimeMatchSpecificity("application/xml", "text/foo+xml")).to.equal(0);
  });

  test("Structured suffix subtype, subtype doesn't match", () => {
    expect(mimeMatchSpecificity("application/reference+json", "application/schema+json")).to.equal(0);
  });

  test("Structured suffix subtype, suffix doesn't match", () => {
    expect(mimeMatchSpecificity("application/json", "application/foo+xml")).to.equal(0);
  });

  test("Structured suffix subtype, subtype matches", () => {
    expect(mimeMatchSpecificity("application/json", "application/reference+json")).to.be.greaterThan(0);
  });

  test("Wildcard type, subtype matches", () => {
    expect(mimeMatchSpecificity("*/xml", "application/xml")).to.be.greaterThan(0);
  });

  test("Wildcard type, subtype doesn't match", () => {
    expect(mimeMatchSpecificity("*/xml", "application/json")).to.equal(0);
  });

  test("Wildcard type, structured suffix subtype matches", () => {
    expect(mimeMatchSpecificity("*/xml", "application/foo+xml")).to.be.greaterThan(0);
  });

  test("Wildcard type, structured suffix subtype doesn't match", () => {
    expect(mimeMatchSpecificity("*/xml", "application/reference+json")).to.equal(0);
  });

  test("Wildcard type, wildcard subtype", () => {
    expect(mimeMatchSpecificity("*/*", "application/reference+json")).to.be.greaterThan(0);
  });
});

describe("mimeMatchSpecificity", () => {
  test("More specific matches have higher specificity", () => {
    const actual = "application/schema+json";
    const rangesFromMostToLeastSpecific = [
      "application/schema+json",
      "*/schema+json",
      "application/json",
      "*/json",
      "application/*",
      "*/*"
    ];

    const specificities = rangesFromMostToLeastSpecific.map((range) => mimeMatchSpecificity(range, actual));
    const sorted = specificities.toSorted((a, b) => b - a);
    expect(specificities).to.eql(sorted);
    expect(new Set(specificities).size).to.equal(specificities.length);
  });

  test("No match", () => {
    expect(mimeMatchSpecificity("application/xml", "application/json")).to.equal(0);
  });
});
