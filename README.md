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

## Browser
This is a generic client for traversing JSON Reference (JRef) and other
JSON-compatible media types in a way that abstracts the references without
loosing information.

This example uses the API at
[https://swapi.hyperjump.io](https://explore.hyperjump.io#https://swapi.hyperjump.io/api/films/1).
It's a variation of the [Star Wars API (SWAPI)](https://swapi.dev) implemented
using the JRef media type.

```javascript
import { get } from "@hyperjump/browser";

const lukeSkywalker = await get("https://swapi.hyperjump.io/api/people/1");
```

### API
* get(uri: string): Promise<Document>

    Retrieve a document located at the given URI. Support for JRef is built-in.
    See the [Media Type Plugins][#media-type-plugins] section for information on
    how to support other media types.

    Throws
    * HttpError
    * UnsupportedMediaTypeError
    * UnknownMediaTypeError

## Media Type Plugins
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
