# Browser

A client for JSON documents that reference each other. It retrieves documents
over HTTP or from files. It follows the references between them for you, so you
can work with linked documents as if they were one value.

```typescript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
const session = h.session();

const film = await session.get("https://swapi.hyperjump.io/api/films/1");
const director = await session.step("director", film);
session.value(director); // "George Lucas"
```

It understands
[JRef](https://github.com/hyperjump-io/json-reference/blob/main/spec.md), a JSON
media type with references like `{ "$ref": "../people/1" }`. A reference can
refer to a value in another document, a file, or on another server. When you
step into it, that value is retrieved for you. Plain JSON works too. You can add
support for other media types and URI schemes.

- **Safe with documents you don't trust.** A document can't make your
  application retrieve whatever it references. You allow what can be
  retrieved.
- **HTTP done properly.** Responses are cached according to their caching
  headers, and stale responses are revalidated. Concurrent requests for the
  same URL share one request.
- **Node.js and browsers.** Works everywhere you need it.

[`@hyperjump/json-schema`](https://github.com/hyperjump-io/json-schema/blob/v2/website/README.md)
is built on it.

Using version 1.x? Its docs are in the
[1.x README](https://github.com/hyperjump-io/browser/tree/v1#readme).

## Contents

- [Install](install.md): Node.js and browsers
- [Getting started](getting-started.md): browsing an API and files step by
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
