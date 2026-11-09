# HTTP cache (`src/hyperjump/http-cache.js`)

- Retrieved `http:` and `https:` responses go in an HTTP cache, according
  to their caching headers. It's the HTTP cache layer of a session's stack,
  above the URL scheme plugins (see [Layers](layers.md)). It stores
  responses, not documents, so it doesn't depend on how a response is
  parsed. It uses `http-cache-semantics`, as a private cache. A stale
  response with an `ETag` or `Last-Modified` is revalidated. A 304 that
  doesn't match the cached response is retried without revalidating.
- Only `http:` and `https:` responses are cached, because caching headers
  are HTTP's (RFC 9111). An application's plugin for those schemes is
  cached too. `file:` responses aren't cached, so each new session reads
  files again.
- Every session from a `Hyperjump` shares its cache. The `Hyperjump`
  resolves it from the `httpCache` config (`hyperjump.httpCache`): the
  store, and the requests in flight. Each session's layer is built over it,
  so sessions share the cache's state, not a stack (see
  [Sessions](sessions.md)).
  - A `cache` option of `HttpUrlSchemePlugin` was rejected. Changing the
    cache would mean replacing the plugin, an application's plugin for
    `http(s):` would need a cache of its own, and the cache's state would
    be shared by every `Hyperjump` given the plugin.
- Only a success (200 or 203) or a redirect is cached. An error is the
  request's response as it came, with its body unread, and it doesn't
  replace what's cached. Caching errors, which RFC 9111 allows when their
  headers say so, is left out until something needs it.
- A response that's stale as soon as it's stored and can't be revalidated
  isn't stored, because it would never be used again.
- A redirect is a response like any other, cached by its own URL. The
  plugin returns it and the session follows it (see
  [Redirects](redirects.md)), so a cacheable one, such as a 301 or a 308,
  isn't requested again while it's fresh. In browsers, `fetch` follows
  redirects, so with a store, the response it ends at is cached under the
  URL that was asked for.
- The store is pluggable (`HttpCacheStore`): `MemoryHttpCacheStore`, the
  default in Node.js, or `FileHttpCacheStore`, which outlives the process.
- Without an `httpCache`, a `Hyperjump` gets the environment's default
  (`#default-http-cache`): a new memory store in Node.js, and none in a
  browser, where `fetch` already respects caching headers. `httpCache:
  false` doesn't cache. So each `Hyperjump` has its own memory store, and
  `Hyperjump`s don't share a cache unless they're given the same store.
  - Not caching without an `httpCache` was rejected, because code for both
    environments couldn't ask for the default.
  - `undefined` is the default, so turning caching off needs another value.
    `false` was chosen over `null` because `httpCache: false` reads as what
    it does.
  - A memory store in browsers too was rejected. It would cache what
    `fetch` already caches and ignore what the browser knows, such as a
    hard reload.
- Requests for the same URL and headers at the same time share one
  request. A session's document cache keeps it from retrieving the same
  resource twice.
  - Sharing by URL only was rejected, because a `Vary` could keep requests
    with different headers apart.
  - A `Referer` doesn't keep requests from sharing one, because it says
    where a reference came from, not what's asked for, and the `http(s):`
    plugin doesn't send it. Two documents that reference the same URL at
    the same time share one request.
  - An error isn't shared. Its body isn't read, so it's only the response
    of the request that got it, and a request waiting on the same one makes
    its own.
  - The requests in flight are the `Hyperjump`'s, with its store. A store
    given to more than one `Hyperjump` is shared, but requests in flight
    aren't. Keeping them in the store, or by store in a module, was
    rejected: a store is an application's interface for where entries go,
    and a module-level map keyed by a store is a hidden dependency.
- The resolved cache is a public property, like the resolved plugins,
  because `Session` can't read a `Hyperjump`'s private fields (see
  [Configuring plugins](sessions.md#configuring-plugins)).
