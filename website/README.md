# Browser

The Hyperjump browser is a hypermedia client for
[JRef](https://github.com/hyperjump-io/json-reference/blob/main/spec.md). JRef
is JSON with references such as `{ "$ref": "../people/1" }`. The browser
retrieves JRef documents over HTTP or from files, and it follows the references
between them for you:

```typescript
import { Hyperjump, browse, jrefValue } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});

const url = "https://swapi.hyperjump.io/api/films/1#/director";
const director = await browse(session, url);
await jrefValue(session, director); // "George Lucas"
```

It retrieves documents the way a web browser does. Requests belong to a
Hyperjump session, the way the requests of a page load do. Each request goes
through a stack of layers, such as an HTTP cache, and ends at a transport that
retrieves it by its URL scheme. On a server, that includes `file:` URLs.

If you use version 1.x, see the
[1.x README](https://github.com/hyperjump-io/browser/tree/v1#readme). For what
changed in v2, see [Migrate from v1](migrate-from-v1.md).

## Contents

- [Install](install.md): install in Node.js and browsers
- [Get started](getting-started.md): browse an API and files step by step
- Documents
  - [Browse to a URL](browse-to-a-url.md): go to the value a URL identifies, following references
  - [Read values](read-values.md): read values, and step into, visit, find, and select the values under them, following references
  - [Follow references yourself](references.md): read references as they're written, and follow them with `browse`
  - [Media types](media-types.md): formats other than JSON and JRef
  - [Parse JSON and JRef](parsing.md): the parsers and the functions that read their ASTs
- Retrieval
  - [Hyperjump sessions](hyperjump-sessions.md): fetch through a session, and close it
  - [What a session can fetch](allow-retrieval.md): allow only the URLs your app should fetch
  - [Registries](registries.md): documents your app already has
  - [Errors](errors.md): what a failed request rejects with, and how to tell failures apart
  - [Layers](layers.md): build a stack and write your own layers
  - [Transports](transports.md): the schemes a stack fetches, and adding your own
  - [File URLs](file-urls.md): fetch `file:` URLs on a server
  - [Redirects](redirects.md): how a session follows redirects through the stack
  - [HTTP caching](http-caching.md): cache responses by their caching headers
  - [Priorities](priorities.md): connection limits, and what loads first
  - [Tracing](tracing.md): see what a session fetched, and why
- [Migrate from v1](migrate-from-v1.md): what changed, and what to do about it
