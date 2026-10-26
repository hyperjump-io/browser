# Hyperjump - Browser

A client for JSON documents that reference each other. It retrieves
documents over HTTP or from files, and follows references for you, so you
work with linked documents as if they were one value.

```javascript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
const session = h.session();

const film = await session.get("https://swapi.hyperjump.io/api/films/1");
const director = await session.step("director", film);
session.value(director); // "George Lucas"
```

It understands [JRef](../src/jref/README.md), a JSON media type with
references, like `{ "$ref": "../people/1" }`. Stepping into a reference
retrieves what it refers to, from another document, a file, or another
server. Plain JSON works too, and you can add other media types and URI
schemes.

- **Safe with documents you don't trust.** A document can't make your
  application retrieve whatever it references. You allow what can be
  retrieved.
- **HTTP done properly.** Responses are cached by their caching headers,
  stale ones are revalidated, and concurrent requests for the same URL share
  one request.
- **Node.js and browsers.**

[`@hyperjump/json-schema`](https://github.com/hyperjump-io/json-schema/blob/v2/website/README.md)
is built on it.

## Contents

- [Install](install.md): Node.js and browsers
- [Getting started](getting-started.md): browsing an API and files, step by
  step
- [Browsing documents](browsing.md): every way to read a document and follow
  its references
- [What can be retrieved](allow-retrieval.md): `allowRetrieval`
- [HTTP caching](http-caching.md)
- [HTTP headers](http-headers.md): sending credentials
- [Media types](media-types.md): supporting formats other than JSON and JRef
- [URI schemes](uri-schemes.md): supporting URIs other than `http(s):` and
  `file:`
- [Parsing JSON and JRef](parsing.md): the parsers and JSON AST utilities
