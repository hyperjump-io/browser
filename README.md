# Hyperjump - Browser

## Install
Includes support for node.js (ES Modules, TypeScript) and browsers.

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
This is a generic client for traversing JSON Reference (JRef) and other
JSON-compatible media types in a way that abstracts the references without
loosing information.

This example uses the API at
[https://swapi.hyperjump.io](https://explore.hyperjump.io#https://swapi.hyperjump.io/api/films/1).
It's a variation of the [Star Wars API (SWAPI)](https://swapi.dev) implemented
using the JRef media type.

```javascript
import { get, value } from "@hyperjump/browser";

const lukeSkywalker = await get("https://swapi.hyperjump.io/api/people/1");
const name = await get("#/name", lukeSkywalker);
value(name); // => Luke Skywalker
```

You can also work with files on the filesystem. When working with files, Media
types are determined by file extensions. The JRef media type uses the `.jref`
extension.

```javascript
import { get, value } from "@hyperjump/browser";

const lukeSkywalker = await get("api/people/1.jref"); // Relative paths work
const name = await get("#/name", lukeSkywalker);
value(name); // => Luke Skywalker
```

### API
* get(uri: string, document?: Document): Promise<Document>

    Retrieve a document located at the given URI. Support for JRef is built-in.
    See the [Media Types](#media-type) section for information on
    how to support other media types. Support for `http(s):` and `file:` URI
    schemes are built-in. See the [Uri Schemes](#uri-schemes) section for
    information on how to support other URI schemes.

    Throws
    * HttpError
    * UnsupportedMediaTypeError
    * UnknownMediaTypeError

* value(document: Browser) => any

    Get the value the document represents. Any references will be returned as a
    `Reference` type.

## Media Types
Support for the JRef media type is included by default, but you can add support
for any media type you like as long as it can be represented in a
JSON-compatible way.

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
* setMediaTypeQuality(contentType: string, quality: number): void;

## URI Schemes
By default, `http(s):` and `file:` URIs are supported. You can add support for
additional URI schemes using plugins.

```javascript
import { addUriSchemePlugin, removeUriSchemePlugin, retrieve } from "@hyperjump/browser";

// Add support for the `urn:` scheme
addUriSchemePlugin("urn", {
  parse: async (response) => {
    const { nid, nss, query, fragment } = parseUrn(uri);
    nid = nid.toLowerCase();

    if (!(nid in mappings) || !(nss in mappings[nid])) {
      throw Error(`Not found - ${uri}`);
    }

    let url = mappings[nid][nss];
    url += query ? "?" + query : "";
    url += fragment ? "#" + fragment : "";

    return retrieve(url, document);
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
    * retrieve: (uri: string, docuemnt: Document) => { response: Response, fragment: string }
* removeUriSchemePlugin(scheme: string): void
* retrieve(uri: string, docuemnt: Document) => { response: Response, fragment: string }

    This is used internally, but you may need if mapping names to locators such
    as in the example above.

## JRef
Parse and stringify JRef values using the same API as the `JSON` built-in
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
