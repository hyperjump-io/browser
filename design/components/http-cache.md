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
- A plugin without a `cache` gets the environment's default
  (`#default-http-cache`): a new memory store in Node.js, and none in a
  browser, where `fetch` already respects caching headers. `cache: false`
  doesn't cache. So each plugin, and each `Hyperjump`'s default plugin, has
  its own memory store, and plugins don't share a cache unless they're
  given the same store.
  - Until 2026-10-30, a plugin without a `cache` didn't cache, and only the
    default plugins had a memory store. Replacing the plugin to send
    headers turned caching off without saying so, unless a store was given
    too, and code for both environments couldn't ask for the default.
  - `undefined` is the default, so turning caching off needs another value.
    `false` was chosen over `null` because `cache: false` reads as what it
    does.
  - A memory store in browsers too was rejected. It would cache what
    `fetch` already caches and ignore what the browser knows, such as a
    hard reload.
- With a cache, requests for the same URL at the same time share one
  request. A session's document cache keeps it from retrieving the same
  resource twice.
- `file:` responses aren't cached, so each new session reads files again.
