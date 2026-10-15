import { describe, test, expect } from "vitest";
import { VFileMessage } from "vfile-message";
import { jref } from "./index.js";

/**
 * @import { JrefNode } from "./index.js"
 */

describe("jref processor", () => {
  test("a file without a path leaves references as written", () => {
    const tree = jref.parse(`{ "$ref": "foo.jref" }`);

    expect(tree.uri).to.equal(undefined);
    const node = /** @type JrefNode & { type: "reference" } */ (tree.children[0]);
    expect(node.type).to.equal("reference");
    expect(node.href).to.equal("foo.jref");
  });

  test("a file without a path can be processed", async () => {
    const result = await jref.process(`{ "$ref": "foo.jref" }`);

    expect(String(result)).to.equal(`{"$ref":"foo.jref"}\n`);
  });

  test("a relative path is resolved against the file's cwd", () => {
    const tree = jref.parse({ cwd: "/foo", path: "bar/main.jref", value: `{ "$ref": "baz.jref" }` });

    expect(tree.uri).to.equal("file:///foo/bar/main.jref");
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
      expect(message.reason).to.equal("Expected :");
      expect(message.line).to.equal(1);
      expect(message.column).to.equal(9);
      expect(message.source).to.equal("json");
      expect(message.ruleId).to.equal("syntax-error");
      expect(message.fatal).to.equal(true);
    }
  });
});
