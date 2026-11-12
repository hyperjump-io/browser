# HTTP cache (`src/http-cache/http-cache.js`)

An HTTP cache by RFC 9111, with the Fetch standard's cache modes. By default
it's a private cache, like a browser's.

- Freshness is from `s-maxage` (a shared cache), `max-age`, or `Expires`,
  and age is worked out as RFC 9111 §4.2.3 says.
- A response that doesn't say its lifetime gets one by heuristic, only for
  the statuses RFC 9111 allows: the application's `heuristic` first, then a
  day for a 301 or a 308, then a tenth of the time since `Last-Modified`.
  Browsers keep permanent redirects a long time. A day is long enough to
  save the round trips and short enough that a redirect set by mistake goes
  away.
- A stale response with an `ETag` or `Last-Modified` is revalidated, and a
  304's headers are merged into what's stored.
- `stale-while-revalidate` serves the stale response and refreshes it in
  the background. The refresh belongs to the session, so the caller
  aborting doesn't stop it, and it's low priority, because nobody is
  waiting for it.
- The request's `max-age`, `min-fresh`, `max-stale`, `no-cache`, and
  `no-store` are followed.
- The cache doesn't do ranges. A request with a `Range` bypasses it, and a
  206 isn't stored, which RFC 9111 §3.3 requires of a cache that doesn't do
  them. With `only-if-cached`, nothing can be sent, so a stored response
  answers it whole, which a server can do too (RFC 9110 §14.2).
- The cache mode is the Fetch standard's, from `fetch(url, { cache })`,
  given to the stack as `ctx.cacheMode`. A runtime on a server ignores
  `Request.cache` or refuses some of its values, so it isn't on the request.
  As in the Fetch standard, a request that's already conditional bypasses
  the cache, and `only-if-cached` is a network error when nothing's stored.
- A successful `POST`, `PUT`, `PATCH`, or `DELETE` removes what's stored for
  its URL, and for its `Location` and `Content-Location` on the same origin.
- A response is stored while the caller reads it: a clone is read for the
  store, so the caller's body streams.
- Runtimes give a decoded body, so a stored response doesn't have its
  `Content-Encoding`, and its `Content-Length` is the decoded length.
- Headers about one connection (`Connection`, `Keep-Alive`,
  `Transfer-Encoding`, and what `Connection` lists) aren't stored, as RFC
  9111 says.
- A response the runtime reached by following a redirect itself isn't stored
  under the URL that was asked for. It's the response the redirect ended at,
  so storing it would make a temporary redirect permanent. That's only in a
  browser. Elsewhere the session follows redirects, so each step is a
  response of its own, and a redirect is stored like any other response (see
  [Redirects](redirects.md)).
- A store that fails, like a full disk, never fails a request. The cache goes
  on as if it had missed and tells `onStoreError`.
- The store is a `CacheStore`: entries are data by URL, one for each `Vary`
  variant, so a store can keep them anywhere. The cache does all the HTTP.
  `MemoryCacheStore` is the default, and keeps at most 1000 URLs, least
  recently used first out.
- The store is the layer's, so sessions on one stack share it, like a
  browser's tabs (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).

## Where it goes

Above the layers that send requests, so a hit never sends one.

Rejected:

- `http-cache-semantics`. It doesn't do `stale-while-revalidate` or more
  than one variant for a URL, and those are what a browser's cache does.
- Partial content: answering ranges from what's stored, storing 206s as
  parts of a representation, and fetching only the bytes that are missing.
  Nothing here sends a `Range`. What it would be for, resuming a download
  that failed, doesn't work for a compressed response: the stored bytes are
  decoded, and the `ETag` of the compressed form is another one or weak.
- A store that does the HTTP. Every store would have to, so writing one, like
  for Redis, would mean writing a cache.
- Caching a redirect the runtime followed under the URL that was asked for,
  so a browser still saved the round trip. A 302
  would be served as if it were permanent.

## Known limitations

- Requests for the same URL that miss at the same time are each sent. A
  browser's cache makes the later ones wait for the first and answers them
  from what it stores. Here a session's document cache keeps a session from
  asking twice, so only sessions that ask at the same time send it twice.
