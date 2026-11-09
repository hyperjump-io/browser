import { sep } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { describe, test, expect } from "vitest";
import { contextUrl } from "./context-url.js";

describe("contextUrl", () => {
  test("is the working directory, as a folder", () => {
    expect(contextUrl()).to.equal(pathToFileURL(cwd() + sep).href);
  });
});
