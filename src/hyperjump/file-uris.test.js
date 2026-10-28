import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { describe, test, expect } from "vitest";
import { relativeFileUri } from "./file-uris.js";

const workingDirectory = pathToFileURL(cwd()).href;

describe("relativeFileUri", () => {
  test("a file in the working directory", () => {
    expect(relativeFileUri(`${workingDirectory}/data/a.json`)).to.equal("data/a.json");
    expect(relativeFileUri(`${workingDirectory}/data/a.json#/b`)).to.equal("data/a.json#/b");
  });

  test("a file outside the working directory", () => {
    expect(relativeFileUri(`${workingDirectory}/../other/a.json`)).to.equal("../other/a.json");
  });

  test("a file URI written with a different case", () => {
    expect(relativeFileUri(`${workingDirectory.replace(/^file:/, "FILE:")}/data/a.json`)).to.equal("data/a.json");
  });

  test("something that isn't a file URI is as it is", () => {
    expect(relativeFileUri("https://example.com/a#/b")).to.equal("https://example.com/a#/b");
    expect(relativeFileUri("#/b")).to.equal("#/b");
  });
});
