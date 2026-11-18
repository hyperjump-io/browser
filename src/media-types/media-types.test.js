import { describe, test, expect } from "vitest";
import { acceptHeader, defaultMediaTypes, mediaTypeForContentType, mediaTypeForExtension } from "./media-types.js";
import { jrefMediaType } from "./jref-media-type.js";
import { jsonMediaType } from "./json-media-type.js";

/**
 * @import { MediaTypePlugin } from "./media-types.d.ts"
 */

describe("media types", () => {
  test("the defaults are JRef, then JSON", () => {
    expect(defaultMediaTypes).to.eql([jrefMediaType, jsonMediaType]);
  });

  describe("the Accept header", () => {
    test("lists each media type in order, and any media type last", () => {
      expect(acceptHeader(defaultMediaTypes)).to.equal("application/reference+json, application/json, */*; q=0.001");
      expect(acceptHeader([])).to.equal("*/*; q=0.001");
    });

    test("has each plugin's quality, 0 included", () => {
      const mediaTypes = [{ ...jrefMediaType, quality: 0.9 }, { ...jsonMediaType, quality: 0 }, plugin("text/x-other")];
      expect(acceptHeader(mediaTypes)).to.equal("application/reference+json; q=0.9, application/json; q=0, text/x-other, */*; q=0.001");
    });

    test.each([-0.1, 1.1, 0.1234, Number.NaN, /** @type any */ ("0.5")])("a quality of %s throws", (quality) => {
      expect(() => acceptHeader([{ ...jsonMediaType, quality }])).to.throw(RangeError, "The quality of the 'application/json' media type");
    });
  });

  describe("the plugin for a Content-Type", () => {
    test("is the one for the media type, without its parameters, in any case", () => {
      expect(mediaTypeForContentType(defaultMediaTypes, "application/json; charset=utf-8")).to.equal(jsonMediaType);
      expect(mediaTypeForContentType(defaultMediaTypes, "Application/Reference+JSON")).to.equal(jrefMediaType);
    });

    test.each([
      null,
      "",
      "not a media type",
      "application/json garbage",
      ";charset=utf-8",
      "*/*"
    ])("there's none for a Content-Type that's missing or isn't a media type: %s", (contentType) => {
      expect(mediaTypeForContentType(defaultMediaTypes, contentType)).to.equal(undefined);
    });

    test("there's none for a media type no plugin has", () => {
      expect(mediaTypeForContentType(defaultMediaTypes, "text/plain")).to.equal(undefined);
      expect(mediaTypeForContentType([], "application/json")).to.equal(undefined);
    });

    test("a plugin parses a media type whose structured suffix is its subtype", () => {
      expect(mediaTypeForContentType(defaultMediaTypes, "application/whatever+json")).to.equal(jsonMediaType);
      expect(mediaTypeForContentType(defaultMediaTypes, "text/whatever+json"), "the type has to match too").to.equal(undefined);
    });

    test("a plugin for the media type wins over the plugin for its suffix, whatever the order", () => {
      const whatever = plugin("application/whatever+json");
      expect(mediaTypeForContentType([jsonMediaType, whatever], "application/whatever+json")).to.equal(whatever);
      expect(mediaTypeForContentType([jsonMediaType, jrefMediaType], "application/reference+json")).to.equal(jrefMediaType);
    });

    test("a range matches, but anything more specific wins", () => {
      const anyApplication = plugin("application/*");
      const anything = plugin("*/*");
      const foo = plugin("application/foo");
      expect(mediaTypeForContentType([anything, anyApplication, foo], "application/foo")).to.equal(foo);
      expect(mediaTypeForContentType([anything, anyApplication, foo], "application/bar")).to.equal(anyApplication);
      expect(mediaTypeForContentType([anything, anyApplication, foo], "text/plain")).to.equal(anything);
      expect(mediaTypeForContentType([anyApplication, jsonMediaType], "application/x+json"), "a suffix is more specific than a range").to.equal(jsonMediaType);
    });

    test("the first plugin wins a tie", () => {
      const first = plugin("application/json");
      expect(mediaTypeForContentType([first, jsonMediaType], "application/json")).to.equal(first);
    });

    test("a plugin whose media type isn't one throws", () => {
      expect(() => mediaTypeForContentType([plugin("json")], "application/json")).to.throw(TypeError, "'json' isn't a media type");
    });
  });

  describe("the plugin for a URL's extension", () => {
    test("is the one with an extension the path ends with", () => {
      expect(mediaTypeForExtension(defaultMediaTypes, "file:///project/a.json")).to.equal(jsonMediaType);
      expect(mediaTypeForExtension(defaultMediaTypes, "file:///project/a.jref?x=1#/b"), "the query and fragment aren't part of the path").to.equal(jrefMediaType);
    });

    test("the longest matching extension wins, whatever the order", () => {
      const schema = plugin("application/x-schema", [".schema.json"]);
      expect(mediaTypeForExtension([jsonMediaType, schema], "file:///project/a.schema.json")).to.equal(schema);
      expect(mediaTypeForExtension([schema, jsonMediaType], "file:///project/a.json")).to.equal(jsonMediaType);
    });

    test("an extension isn't a whole file name, and a file name is", () => {
      const rc = plugin("application/x-rc", ["/.bowerrc"]);
      expect(mediaTypeForExtension([jsonMediaType, rc], "file:///project/.json")).to.equal(undefined);
      expect(mediaTypeForExtension([jsonMediaType, rc], "file:///project/.bowerrc")).to.equal(rc);
      expect(mediaTypeForExtension([jsonMediaType, rc], "file:///project/a.bowerrc")).to.equal(undefined);
    });

    test("an extension matches whatever its case, as a web server's does", () => {
      const schema = { ...jsonMediaType, extensions: [".Schema.json"] };
      expect(mediaTypeForExtension(defaultMediaTypes, "file:///project/A.JSON")).to.equal(jsonMediaType);
      expect(mediaTypeForExtension([jsonMediaType, schema], "file:///project/a.schema.JSON")).to.equal(schema);
    });

    test("there's none without a matching extension", () => {
      expect(mediaTypeForExtension(defaultMediaTypes, "file:///project/a.txt")).to.equal(undefined);
      expect(mediaTypeForExtension(defaultMediaTypes, "file:///project/json")).to.equal(undefined);
    });
  });

  describe.each([
    ["JSON", jsonMediaType],
    ["JRef", jrefMediaType]
  ])("the %s plugin", (_name, mediaType) => {
    test("a document's URL is its response's URL, which its locations start with", async () => {
      const document = await mediaType.parse({ text: async () => `{ "a": 1 }`, url: "https://example.com/main" });
      expect(document.url).to.equal("https://example.com/main");
      expect(document.status).to.equal("success");
      expect(document.children[0].location).to.equal("https://example.com/main#");
    });

    test("a syntax error rejects with where it is, and the error as its cause", async () => {
      const parsing = mediaType.parse({ text: async () => `{\n  "a": 1,\n}`, url: "https://example.com/main" });
      await expect(parsing).rejects.toThrow(SyntaxError);
      await expect(parsing).rejects.toThrow("Trailing commas are not allowed at https://example.com/main:2:9");
      await expect(parsing).rejects.toMatchObject({ cause: { code: "ERR_SYNTAX", source: "json", ruleId: "trailing-comma" }, url: "https://example.com/main" });
    });
  });

  test("the JSON plugin has no references, and its fragments identify the whole document", async () => {
    const document = await jsonMediaType.parse({ text: async () => `{ "$ref": "b" }`, url: "https://example.com/a" });
    expect(document.children[0]).to.include({ type: "json", jsonType: "object" });
    expect(document).to.not.have.property("anchors");
  });

  test("the JRef plugin resolves references, and its fragments are JSON Pointers", async () => {
    const document = await jrefMediaType.parse({ text: async () => `{ "$ref": "b" }`, url: "https://example.com/a" });
    expect(document.children[0]).to.include({ type: "reference", href: "https://example.com/b" });
    expect(document.anchors).to.eql({});
  });

  test("the JRef plugin rejects a document with a reference that isn't a URL", async () => {
    const parsing = jrefMediaType.parse({ text: async () => `{ "$ref": "//[" }`, url: "https://example.com/main.jref" });
    await expect(parsing).rejects.toThrow("'//[' is not a valid reference at https://example.com/main.jref:1:11");
    await expect(parsing).rejects.toMatchObject({ cause: { source: "jref", ruleId: "invalid-reference" } });
  });
});

/**
 * A plugin for a media type that's never asked to parse
 *
 * @type (mediaType: string, extensions?: string[]) => MediaTypePlugin
 */
const plugin = (mediaType, extensions = []) => ({
  mediaType,
  extensions,
  parse: async (response) => ({ type: "test-document", children: [], url: response.url })
});
