# Hyperjump - Browser

The Hyperjump Browser is a generic client for traversing JSON Reference ([JRef])
and other [JRef]-compatible media types in a way that abstracts the references
without loosing information.

## Install

This module is designed for node.js (ES Modules, TypeScript) and browsers. It
should work in Bun and Deno as well, but the test runner doesn't work in these
environments, so this module may be less stable in those environments.

### Node.js

```bash
npm install @hyperjump/browser
```

### Browser

When in a browser context, this library is designed to use the browser's `fetch`
implementation instead of a node.js fetch clone. The Webpack bundler does this
properly without any extra configuration, but if you are using the Rollup
bundler you will need to include the `browser: true` option in your Rollup
configuration.

```javascript
  plugins: [
    resolve({
      browser: true
    })
  ]
```

## JRef Browser

This example uses the API at
[https://swapi.hyperjump.io](https://explore.hyperjump.io#https://swapi.hyperjump.io/api/films/1).
It's a variation of the [Star Wars API (SWAPI)](https://swapi.dev) implemented
using the [JRef] media type.

```javascript
import { get, step, value, iter } from "@hyperjump/browser";

const aNewHope = await get("https://swapi.hyperjump.io/api/films/1");
const characters = await get("#/characters", aNewHope); // Or
const characters = await step("characters", aNewHope);

for await (const character of iter(characters)) {
  const name = await step("name", character);
  value(name); // => Luke Skywalker, etc.
}
```

You can also work with files on the file system. When working with files, media
types are determined by file extensions. The [JRef] media type uses the `.jref`
extension.

```javascript
import { get, value } from "@hyperjump/browser";

const lukeSkywalker = await get("./api/people/1.jref"); // Paths resolve relative to the current working directory
const name = await step("name", lukeSkywalker);
value(name); // => Luke Skywalker
```

### API

* get(uri: string, document?: Document): Promise\<Document>

    Retrieve a document located at the given URI. Support for [JRef] is built
    in. See the [Media Types](#media-type) section for information on how
    to support other media types. Support for `http(s):` and `file:` URI schemes
    are built in. See the [Uri Schemes](#uri-schemes) section for information on
    how to support other URI schemes.
* value(document: Document) => Json

    Get the JSON compatible value the document represents. Any references will
    have been followed so you'll never receive a `Reference` type.
* step(key: string | number, document: Document) => Promise\<Document>

    Move the document cursor by the given "key" value. This is analogous to
    indexing into an object or array (`foo[key]`). This function supports
    curried application.
* **Schema.iter**: (document: Document) => AsyncGenerator\<Document>

    Iterate over the items in the array that the Document represents.
* **Schema.entries**: (document: Document) => AsyncGenerator\<[string, Document]>

    Similar to `Object.entries`, but yields Documents for values.
* **Schema.values**: (document: Document) => AsyncGenerator\<Document>

    Similar to `Object.values`, but yields Documents for values.
* **Schema.keys**: (document: Document) => Generator\<string>

    Similar to `Object.keys`.

## Media Types

Support for the [JRef] media type is included by default, but you can add
support for any media type you like as long as it can be represented in a
[JRef]-compatible way.

```javascript
import { addMediaTypePlugin, removeMediaTypePlugin, setMediaTypeQuality } from "@hyperjump/browser";
import YAML from "yaml";

// Add support for YAML version of JRef (YRef)
addMediaTypePlugin("application/reference+yaml", {
  parse: async (response) => {
    return {
      documentValue: YAML.parse(await response.text(), (key, value) => {
        return value !== null && typeof value.$href === "string"
          ? new Reference(value.$href)
          : value;
      });
    };
  }
});

// Prefer "YRef" over JRef by reducing the quality for JRef.
setMediaTypeQuality("application/reference+json", 0.9);

// Only support YRef by removing JRef support.
removeMediaTypePlugin("application/reference+json");
```

### API

* addMediaTypePlugin(contentType: string, plugin: MediaTypePlugin): void

    Add support for additional media types.

  * type MediaTypePlugin
    * parse: (content: string) => Document
    * [quality](https://developer.mozilla.org/en-US/docs/Glossary/Quality_values):
      number (defaults to `1`)
* removeMediaTypePlugin(contentType: string): void

    Removed support or a media type.
* setMediaTypeQuality(contentType: string, quality: number): void;

    Set the
    [quality](https://developer.mozilla.org/en-US/docs/Glossary/Quality_values)
    that will be used in the
    [Accept](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept)
    header of requests to indicate to servers what media types are preferred
    over others.

## URI Schemes

By default, `http(s):` and `file:` URIs are supported. You can add support for
additional URI schemes using plugins.

```javascript
import { addUriSchemePlugin, removeUriSchemePlugin, retrieve } from "@hyperjump/browser";

// Add support for the `urn:` scheme
addUriSchemePlugin("urn", {
  parse: (urn, document) => {
    let { nid, nss, query, fragment } = parseUrn(urn);
    nid = nid.toLowerCase();

    if (!mappings[nid]?.[nss]) {
      throw Error(`Not Found -- ${urn}`);
    }

    let uri = mappings[nid][nss];
    uri += query ? "?" + query : "";
    uri += fragment ? "#" + fragment : "";

    return retrieve(uri, document);
  }
});

// Only support `urn:` by removing default plugins
removeUriSchemePlugin("http");
removeUriSchemePlugin("https");
removeUriSchemePlugin("file");
```

### API
* addUriSchemePlugin(scheme: string, plugin: UriSchemePlugin): void

    Add support for additional URI schemes.

  * type UriSchemePlugin
    * retrieve: (uri: string, document: Document) => Promise\<{ response: Response, fragment: string }>
* removeUriSchemePlugin(scheme: string): void

    Remove support for a URI scheme.
* retrieve(uri: string, document: Document) => Promise\<{ response: Response, fragment: string }>

    This is used internally, but you may need it if mapping names to locators
    such as in the example above.

## JRef

Parse and stringify [JRef] values using the same API as the `JSON` built-in
functions including reviver and replacer functions.

```javascript
import { parse, stringify, Reference } from "@hyperjump/browser/jref";

const blogPostJref = `{
  "title": "Working with JRef",
  "author": { "$href": "/author/jdesrosiers" },
  "content": "lorem ipsum dolor sit amet",
}`;
const blogPost = parse(blogPostJref);
blogPost.author instanceof Reference; // => true
blogPost.author.href; // => "/author/jdesrosiers"

stringify(blogPost, null, "  ") === blogPostJref // => true
```

## Contributing

### Tests

Run the tests

```bash
npm test
```

Run the tests with a continuous test runner

```bash
npm test -- --watch
```

[JRef]: https://github.com/hyperjump-io/browser/blob/main/lib/jref/SPECIFICATION.md
