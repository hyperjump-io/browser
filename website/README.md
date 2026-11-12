# Browser

The Hyperjump browser is a hypermedia client for
[JRef](https://github.com/hyperjump-io/json-reference/blob/main/spec.md). JRef
is JSON with references such as `{ "$ref": "../people/1" }`. The browser
retrieves JRef documents over HTTP or from files, and it follows the references
between them for you:

```typescript
import { Hyperjump, get, jsonValue } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});

const url = "https://swapi.hyperjump.io/api/films/1#/director";
jsonValue(await get(session, url)); // "George Lucas"
```

It retrieves documents the way a web browser does. Requests belong to a
session, the way the requests of a page load do. Each request goes through a
stack of layers, such as an HTTP cache, and ends at a transport that retrieves
it by its URL scheme. On a server, that includes `file:` URLs.

## Contents

- [Install](install.md): install in Node.js and browsers
- [Get started](getting-started.md): build a stack and load a page like a browser does
- [Get documents](documents.md): get a value from a document, and follow references
- [Media types](media-types.md): formats other than JSON and JRef
- [Sessions](sessions.md): fetch through a session, and close it
- [What a session can fetch](allow-retrieval.md): allow only the URLs your app should fetch
- [Errors](errors.md): what a failed request rejects with, and how to tell failures apart
- [Layers](layers.md): build a stack and write your own layers
- [File URLs](file-urls.md): fetch `file:` URLs on a server
- [Redirects](redirects.md): how a session follows redirects through the stack
- [HTTP caching](http-caching.md): cache responses by their caching headers
- [Priorities](priorities.md): connection limits, and what loads first
- [Tracing](tracing.md): see what a session fetched, and why
- [Parse JSON and JRef](parsing.md): the parsers and the functions that read their ASTs
