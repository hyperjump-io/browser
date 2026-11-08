import { sep } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { describe, test, expect } from "vitest";
import { isAbsoluteIri } from "@hyperjump/uri";
import { contextUri } from "./context-uri.js";

describe("contextUri", () => {
  test("is the working directory, as a folder", () => {
    expect(contextUri()).to.equal(pathToFileURL(cwd() + sep).href);
  });

  test("is an absolute IRI", () => {
    expect(isAbsoluteIri(/** @type string */ (contextUri()))).to.equal(true);
  });
});
