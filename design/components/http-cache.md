# HTTP cache (`src/http-cache/http-cache.js`)

An HTTP cache by RFC 9111, with the Fetch standard's cache modes. By default
it's a private cache, like a browser's.

- Freshness is from `s-maxage` (a shared cache), `max-age`, or `Expires`,
  and age is worked out as RFC 9111 §4.2.3 says. In a shared cache,
  `s-maxage` means `proxy-revalidate` too (RFC 9111 §5.2.2.10), so a
  response past it is revalidated, and neither `max-stale` nor
  `stale-while-revalidate` serves it stale.
- A response that doesn't say its lifetime gets one by heuristic, only for
  the statuses RFC 9111 allows: the application's `heuristic` first, then a
  day for a 301 or a 308, then a tenth of the time since `Last-Modified`.
  Browsers keep permanent redirects a long time. A day is long enough to
  save the round trips and short enough that a redirect set by mistake goes
  away.
- A stale response with an `ETag` or `Last-Modified` is revalidated, and a
  304's headers are merged into what's stored.
  - The stored response's age is the 304's, so a 304 without an `Age` is
    as old as it is. Its age is figured from its `Date` and the times of
    its request and response, and the `Age` that goes with them is its
    own. A response that was 50 minutes old when a CDN gave it, with an
    hour's `max-age`, is fresh for an hour after the origin's 304.
  - Keeping the stored `Age` when a 304 has none, which RFC 9111's
    section 4.3.4 allows, was rejected. It mixes two responses in one age:
    the response that was 50 minutes old would be 50 minutes old again
    after every 304, and revalidated every 10 minutes for as long as it's
    stored.
- `stale-while-revalidate` serves the stale response and refreshes it in
  the background. The refresh is a request of the session's,
  `session.fetch` with `cache: "no-cache"`, so it goes down the stack
  again and this cache revalidates it. It has its own record, whose
  initiator is the stale response's, so a trace shows what caused it and
  the stale response's record ends when it does. The caller aborting
  doesn't stop it, and it's low priority, because nobody is waiting for
  it. It's `redirect: "manual"`, so it refreshes the response that was
  served, even a redirect. The stale response is marked
  `cache:background-revalidate`.
- A stored response is refreshed in the background once at a time, like a
  browser's cache does. One that's served stale again while it's refreshed
  doesn't start another. The cache keeps what it's refreshing by URL and
  the request headers its `Vary` names, which say which variant it is. It's
  the layer's, like the store, so sessions on one stack share it.
  - Refreshing it with the stale response's context was rejected. What
    the refresh did was marked on a record that had ended, so a trace and
    a HAR export gave a hit from the cache the time the refresh took. It's the origin allowing a stale response, so a request
  that doesn't want one, with `max-age` or `min-fresh` and without
  `max-stale` (RFC 9111 §5.2.1), is revalidated first. That's also true of
  a response that's only too old for the request, not past its own
  lifetime.
- The request's `max-age`, `min-fresh`, `max-stale`, `no-cache`, and
  `no-store` are followed.
- The cache doesn't do ranges. A request with a `Range` bypasses it, and a
  206 isn't stored, which RFC 9111 §3.3 requires of a cache that doesn't do
  them. With `only-if-cached`, nothing can be sent, so a stored response
  answers it whole, which a server can do too (RFC 9110 §14.2).
- The cache mode is the Fetch standard's, from `fetch(url, { cache })`,
  given to the stack as `ctx.cacheMode`. It isn't on the request, because
  Node.js's `fetch` refuses `only-if-cached` there unless the mode is
  `same-origin`, and then sends it, since it has no cache. The network
  fetcher gives the runtime the mode (see
  [The scheme transport](scheme-transport.md)).
  As in the Fetch standard, a request that's already conditional bypasses
  the cache, and `only-if-cached` is a network error when nothing's stored.
  `only-if-cached` never sends, so nothing about the request makes it
  another mode. A request's `no-store` only says not to store anything
  (RFC 9111 §5.2.1.5), so a stored response still answers it.
- A successful request with any method that isn't safe removes what's
  stored for its URL, and for its `Location` and `Content-Location` on the
  same origin. The safe methods are RFC 9110's: `GET`, `HEAD`, `OPTIONS`,
  and `TRACE`. Any other method invalidates, even one whose safety isn't
  known, like `PROPPATCH`, as RFC 9111 says a cache must. Methods are
  case-sensitive, and the Fetch standard only makes six of them uppercase,
  so `patch` is a method of its own, not `PATCH`, and it invalidates too.
  A `Location` or `Content-Location` that isn't a URL names nothing, so
  it's skipped. The request has succeeded, so it doesn't fail because of
  it.
  - A response is stored after its body is read, so one that's on its way
    when its URL is invalidated would put back what the invalidation
    removed. The cache keeps the requests it's sent until what they got is
    stored or isn't, and an invalidation marks the ones for its URL, which
    then aren't stored. One sent before the invalidation's response came
    could have been answered before or after the change, so it's not
    stored either.
  - Counting how many times each URL is invalidated, and not storing a
    response whose URL's count changed since its request was sent, was
    rejected. It would keep a count for every URL ever invalidated. What's
    kept instead is only what's in flight.
- A response is stored while the caller reads it: a clone is read for the
  store, so the caller's body streams. The clone is read a chunk at a time,
  and once it's bigger than `maxBodySize` it's cancelled and nothing is
  stored. `Content-Length` can be missing, or be the length of the
  compressed body, so what's read is all that says how big it is.
- A stored response keeps only the request headers its `Vary` names,
  which is all that's compared to choose it. A credential, like the
  session's `Authorization` or a request's `Cookie`, isn't kept with a
  response that doesn't vary by it, in memory or on disk. A 304 can change
  `Vary`, so a response it updates takes them from the request that
  revalidated it, which matched the stored ones.
  - Keeping every request header was rejected. Nothing reads the others,
    and a store on disk would write every credential to a file.
- Runtimes give a decoded body, so a stored response doesn't have its
  `Content-Encoding`, and its `Content-Length` is the decoded length.
- Headers about one connection (`Connection`, `Keep-Alive`,
  `Transfer-Encoding`, and what `Connection` lists) aren't stored, as RFC
  9111 says.
- The session follows redirects, so each step is a response of its own, and
  a redirect is stored like any other response (see
  [Redirects](redirects.md)).
- Only `http:` and `https:` URLs go through the cache. Anything else, like
  a `file:` URL, is passed on, and its cache status is `"bypass"`. Only
  HTTP has caching, and a file is read each time, so it's always current.
- In a browser, it throws (`#http-cache`). A browser caches responses
  already, below anything a page can add, so a second cache would only
  keep copies of what the first has.
- A store that fails, like a full disk, never fails a request. The cache goes
  on as if it had missed and tells `onStoreError`.
- The store is a `CacheStore`: entries are data by URL, one for each `Vary`
  variant, so a store can keep them anywhere. The cache does all the HTTP.
  `MemoryCacheStore` is the default, and keeps at most 64 MB of bodies and
  headers, least recently used first out. Its `size()` is bytes, like
  `FileCacheStore`'s. Both are methods, so `await store.size()` reads
  either, and the memory store's answers at once, like its other methods.
- A body bigger than `maxBodySize`, 16 MB by default, isn't stored. The
  default is many times the biggest schemas, 815 KB in the SchemaStore
  schemas in `sourcemeta/jsonschema-benchmark`, and big enough for a large
  API's description. A response that's too big still succeeds.
  - No limit by default was rejected. A cache in memory would keep what a
    server sends without end, even after the caller has stopped reading
    it, because the stored copy reads on.
  - A limit on the URLs `MemoryCacheStore` keeps was rejected. It doesn't
    limit memory: 1000 URLs of 16 MB is 16 GB.
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

## Known limitations

- Requests for the same URL that miss at the same time are each sent. A
  browser's cache makes the later ones wait for the first and answers them
  from what it stores. Here a session's document cache keeps a session from
  asking twice, so only sessions that ask at the same time send it twice.
