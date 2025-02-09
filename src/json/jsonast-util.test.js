import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, test, expect } from "vitest";
import { VFileMessage } from "vfile-message";
import { rejson, rejsonStringify } from "./index.js";


describe("jsonast-util", async () => {
  const testPath = resolve(import.meta.dirname, "jsonast-util-tests");
  for (const entry of await readdir(testPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const file = resolve(entry.parentPath, entry.name);
    const json = await readFile(file, "utf8");

    if (entry.name.startsWith("y_")) {
      test(`${entry.name.substring(2)} without spaces`, async () => {
        const processed = await rejson()
          .use(rejsonStringify, { space: "" })
          .process(json);
        const expected = JSON.stringify(JSON.parse(json)) + "\n";
        expect(processed.toString()).to.eql(expected);
      });

      test(`${entry.name.substring(2)} with spaces`, async () => {
        const processed = await rejson().process(json);
        const expected = JSON.stringify(JSON.parse(json), null, "  ") + "\n";
        expect(processed.toString()).to.eql(expected);
      });
    } else if (entry.name.startsWith("n_")) {
      test(entry.name.substring(2), () => {
        expect(() => rejson.processSync(json)).to.throw(VFileMessage);
      });
    }
  }
});
