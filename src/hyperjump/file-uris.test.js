import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { describe, test, expect } from "vitest";
import { assertIriReference } from "@hyperjump/uri";
import { relativeFileUri } from "./file-uris.js";

/**
 * @import { IriReference } from "@hyperjump/uri"
 */

const workingDirectory = pathToFileURL(cwd()).href;

describe("relativeFileUri", () => {
  test("a file in the working directory", () => {
    expect(relativeFileUri(checked(`${workingDirectory}/data/a.json`))).to.equal("data/a.json");
    expect(relativeFileUri(checked(`${workingDirectory}/data/a.json#/b`))).to.equal("data/a.json#/b");
  });

  test("a file outside the working directory", () => {
    expect(relativeFileUri(checked(`${workingDirectory}/../other/a.json`))).to.equal("../other/a.json");
  });

  test("a file URI written with a different case", () => {
    expect(relativeFileUri(checked(`${workingDirectory.replace(/^file:/, "FILE:")}/data/a.json`))).to.equal("data/a.json");
  });

  test("something that isn't a file URI is as it is", () => {
    expect(relativeFileUri(checked("https://example.com/a#/b"))).to.equal("https://example.com/a#/b");
    expect(relativeFileUri(checked("#/b"))).to.equal("#/b");
  });
});

/**
 * The URIs are made from the working directory, so they're checked
 *
 * @type (value: string) => IriReference
 */
const checked = (value) => {
  assertIriReference(value);
  return value;
};
