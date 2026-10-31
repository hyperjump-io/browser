# Browser

The Hyperjump browser is a hypermedia client for
[JRef](https://github.com/hyperjump-io/json-reference/blob/main/spec.md). JRef
is JSON with references like `{ "$ref": "../people/1" }`. The browser retrieves
JRef documents over HTTP or from files. It follows the references between them
for you so you can work with linked documents as if they were one value. This
example gets the director of a film from an API written in JRef:

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

A reference can refer to a value in another document, in a file, or on another
server. When you step into a reference, that value is retrieved for you.

The Hyperjump browser also works with other media types, as long as they can be
parsed into a JRef AST. Plain JSON is supported by default. You can add support
for other [media types](media-types.md) and [URI schemes](uri-schemes.md).

- **Safe with documents you don't trust.** A document can't make your
  application retrieve whatever it references. You allow what can be
  retrieved.
- **HTTP done properly.** Responses are cached according to their caching
  headers, and stale responses are revalidated. Concurrent requests for the
  same URL share one request.
- **Node.js and browsers.** Works everywhere you need it.

[`@hyperjump/json-schema`](https://github.com/hyperjump-io/json-schema/blob/v2/website/README.md)
is built on the Hyperjump browser.

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
