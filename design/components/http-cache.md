# HTTP cache (`src/hyperjump/uri-schemes/http-scheme-plugin.js`)

- Retrieved responses go in an HTTP cache, according to their caching
  headers. It's under the URI scheme plugins and stores responses, not
  documents, so it doesn't depend on how a response is parsed, and every
  session from a `Hyperjump` shares it.
- It's part of `HttpUriSchemePlugin` (a `cache` option), because caching
  headers are HTTP's. It uses `http-cache-semantics`, as a private cache. A
  stale response with an `ETag` or `Last-Modified` is revalidated. A 304
  that doesn't match the cached response is retried without revalidating.
- A response that's stale as soon as it's stored and can't be revalidated
  isn't stored, because it would never be used again.
- The store is pluggable (`HttpCacheStore`): `MemoryHttpCacheStore`, the
  default in Node.js, or `FileHttpCacheStore`, which outlives the process.
- In a browser, `fetch` already respects caching headers, so there's no
  cache by default.
- With a cache, requests for the same URL at the same time share one
  request. A session's document cache keeps it from retrieving the same
  resource twice.
- `file:` responses aren't cached, so each new session reads files again.
