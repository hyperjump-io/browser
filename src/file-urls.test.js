import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { describe, test, expect } from "vitest";
import { relativeFileUrl } from "./file-urls.js";

const workingDirectory = pathToFileURL(cwd()).href;

describe("relativeFileUrl", () => {
  test("a file in the working directory", () => {
    expect(relativeFileUrl(`${workingDirectory}/data/a.json`)).to.equal("data/a.json");
    expect(relativeFileUrl(`${workingDirectory}/data/a.json#/b`)).to.equal("data/a.json#/b");
  });

  test("a file outside the working directory", () => {
    expect(relativeFileUrl(new URL(`${workingDirectory}/../other/a.json`).href)).to.equal("../other/a.json");
  });

  test("the working directory", () => {
    expect(relativeFileUrl(`${workingDirectory}/`)).to.equal("./");
  });

  test("a file on another host is as it is", () => {
    expect(relativeFileUrl("file://example.com/a.json")).to.equal("file://example.com/a.json");
  });

  test("something that isn't a file URL is as it is", () => {
    expect(relativeFileUrl("https://example.com/a#/b")).to.equal("https://example.com/a#/b");
  });
});
