# Browser

The Hyperjump browser is a hypermedia client for
[JRef](https://github.com/hyperjump-io/json-reference/blob/main/spec.md). JRef
is JSON with references such as `{ "$ref": "../people/1" }`. The browser
retrieves JRef documents over HTTP or from files. It follows the references
between them for you so you can work with linked documents as if they were one
value. This example gets the director of a film from an API written in JRef:

```typescript
import { Hyperjump, jrefStep, jrefValue } from "@hyperjump/browser";

const h = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
const session = h.session();

const film = await session.get("https://swapi.hyperjump.io/api/films/1");
const director = await jrefStep(session, "director", film);
jrefValue(director); // "George Lucas"
```

A reference can refer to a value in another document, in a file, or on another
server. When you step into a reference, the browser retrieves that value for
you.

The browser also works with other media types as long as a parser can turn them
into a JRef abstract syntax tree (AST). It reads plain JSON by default, and you
can add your own [media types](media-types.md) and
[URI schemes](uri-schemes.md).

- **Safe with documents you don't trust.** A document can't make your app
  retrieve whatever it references. You choose what the browser can retrieve.
- **HTTP done properly.** The browser caches responses according to their
  caching headers and revalidates stale ones. Concurrent requests for the same
  URL share one request.
- **Node.js and browsers.** It runs on the server and in web browsers.

[`@hyperjump/json-schema`](https://github.com/hyperjump-io/json-schema/blob/v2/website/README.md)
builds on the Hyperjump browser.

Using version 1.x? Its docs are in the
[1.x README](https://github.com/hyperjump-io/browser/tree/v1#readme).

## Contents

- [Install](install.md): install in Node.js and browsers
- [Get started](getting-started.md): browse an API and files step by step
- [Browse documents](browsing.md): every way to read a document and follow
  its references
- [What a session can retrieve](allow-retrieval.md): `allowRetrieval`
- [HTTP caching](http-caching.md)
- [HTTP headers](http-headers.md): send credentials
- [Media types](media-types.md): formats other than JSON and JRef
- [URI schemes](uri-schemes.md): schemes other than `http:`, `https:`,
  and `file:`
- [Parse JSON and JRef](parsing.md): the parsers and the functions that read
  their ASTs
