# Hyperjump - Browser

The Hyperjump Browser is a generic client for traversing JSON Reference ([JRef])
and other [JRef]-compatible media types in a way that abstracts the references
without loosing information.

Everything is built to work with the [unified](https://unifiedjs.com/) ecosystem
of libraries and tools. This module defines ASTs for representing JSON and JRef
documents and provides a CLI and utilities allowing you to parse, transform, and
stringify documents.

## Install

This module is designed for node.js (ES Modules, TypeScript) and browsers. It
should work in Bun and Deno as well, but the test runner doesn't work in these
environments, so this module may be less stable in those environments.

### Node.js

```bash
npm install @hyperjump/browser
```

## JRef Browser

This example uses the API at
[https://swapi.hyperjump.io](https://explore.hyperjump.io#https://swapi.hyperjump.io/api/films/1).
It's a variation of the [Star Wars API (SWAPI)](https://swapi.dev) implemented
using the [JRef] media type.

```javascript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump();
const aNewHope = await h.get("https://swapi.hyperjump.io/api/films/1");
const characters = await h.step("characters", aNewHope);

for await (const character of h.iter(characters)) {
  const name = await h.step("name", character);
  h.value(name); // => Luke Skywalker, etc.
}
```

You can also work with files on the file system. When working with files, media
types are determined by file extensions. The [JRef] media type uses the `.jref`
extension.

```javascript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump();
const lukeSkywalker = await h.get("./api/people/1.jref"); // Paths resolve relative to the current working directory
const name = await h.step("name", lukeSkywalker);
h.value(name); // => Luke Skywalker
```

## Media Types

Support for the JSON and [JRef] media types are included by default, but you can
add support for any media type you like as long as it can be represented in a
[JRef]-compatible way.

```javascript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump();

// Add support for YAML version of JRef (YRef)
export class YrefMediaTypePlugin {
  constructor(quality) {
    this.quality = quality;
  }

  async parse(response) {
    return {
      type: "jref-document",
      uri: response.url,
      children: [parseYamlToJrefAst(await response.text())],
      fragmentKind: "json-pointer"
    };
  }

  async fileMatcher(path) {
    return /[^/]\.yref$/.test(path);
  }
}
h.addMediaTypePlugin("application/reference+yaml", new YrefMediaTypePlugin());

// Prefer "YRef" over JRef by reducing the quality for JRef.
h.setMediaTypeQuality("application/reference+json", 0.9);

// Only support YRef by removing JRef support.
h.removeMediaTypePlugin("application/reference+json");
```

## URI Schemes

By default, `http(s):` and `file:` URIs are supported. You can add support for
additional URI schemes using plugins.

```javascript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump();

// Add support for the `urn:` scheme
class UrnSchemePlugin {
  async retrieve(urn, baseUri) {
    let { nid, nss, query, fragment } = parseUrn(urn);
    nid = nid.toLowerCase();

    if (!mappings[nid]?.[nss]) {
      throw Error(`Not Found -- ${urn}`);
    }

    let uri = mappings[nid][nss];
    uri += query ? "?" + query : "";
    uri += fragment ? "#" + fragment : "";

    return await h.retrieve(uri, baseUri);
  }
}
h.addUriSchemePlugin("urn", new UrnSchemePlugin());

// Only support `urn:` by removing default plugins
h.removeUriSchemePlugin("http");
h.removeUriSchemePlugin("https");
h.removeUriSchemePlugin("file");
```

## JRef

TODO

## JSON

TODO

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

[JRef]: https://github.com/hyperjump-io/browser/blob/main/src/jref/README.md
