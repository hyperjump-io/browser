import { describe, test, expect } from "vitest";
import { unified } from "unified";
import { VFileMessage } from "vfile-message";
import { jrefParse, jrefStringify } from "../hyperjump/index.js";

/**
 * @import { JrefNode } from "../hyperjump/index.js"
 */

// The plugins as a processor would use them
const jref = unified()
  .use(jrefParse)
  .use(jrefStringify)
  .freeze();

describe("jref processor", () => {
  test("a file without a path fails, because it has no URL", () => {
    expect(() => jref.parse(`{ "$ref": "foo.jref" }`)).to.throw(VFileMessage);
  });

  test("a file's references are stringified as they were written", async () => {
    const result = await jref.process({ path: "/doc.jref", value: `{ "$ref": "foo.jref" }` });

    expect(String(result)).to.equal(`{"$ref":"foo.jref"}\n`);
  });

  test("a relative path is resolved against the file's cwd", () => {
    const tree = jref.parse({ cwd: "/foo", path: "bar/main.jref", value: `{ "$ref": "baz.jref" }` });

    expect(tree.url).to.equal("file:///foo/bar/main.jref");
    const node = /** @type JrefNode & { type: "reference" } */ (tree.children[0]);
    expect(node.href).to.equal("file:///foo/bar/baz.jref");
  });

  test("syntax errors keep their position, source, and ruleId", () => {
    try {
      jref.processSync({ path: "/foo/main.jref", value: `{ "foo" 1 }` });
      expect.fail("Expected a VFileMessage");
    } catch (error) {
      expect(error).to.be.instanceof(VFileMessage);
      const message = /** @type VFileMessage */ (error);
      expect(message.reason).to.equal("Expected a colon");
      expect(message.line).to.equal(1);
      expect(message.column).to.equal(3);
      expect(message.source).to.equal("json");
      expect(message.ruleId).to.equal("colon-expected");
      expect(message.fatal).to.equal(true);
    }
  });
});
