# HTTP cache (`src/http-cache/http-cache.js`)

An HTTP cache by RFC 9111, with the Fetch standard's cache modes. By default
it's a private cache, like a browser's.

- Freshness and age are as RFC 9111 says. In a shared cache, `s-maxage`
  means `proxy-revalidate` too (§5.2.2.10), so neither `max-stale` nor
  `stale-while-revalidate` serves a response past it.
- A response that doesn't say its lifetime gets one by heuristic, only for
  the statuses RFC 9111 allows: the application's `heuristic`, then a day
  for a 301 or a 308, then a tenth of the time since `Last-Modified`. A day
  saves the round trips, and a redirect set by mistake goes away.
- A 304's headers are merged into what's stored, and the stored response's
  age is the 304's. A response that was 50 minutes old when a CDN gave it,
  with an hour's `max-age`, is fresh for an hour after the origin's 304.
  - Keeping the stored `Age` when a 304 has none, which §4.3.4 allows, was
    rejected. That response would be 50 minutes old again after every 304.
- `stale-while-revalidate` serves the stale response and refreshes it with
  `session.fetch` and `cache: "no-cache"`, so the refresh goes down the
  stack and has its own record, initiated by the stale response's. It's
  low priority, `redirect: "manual"`, and the caller aborting doesn't stop
  it. A response is refreshed once at a time, by URL and the request
  headers its `Vary` names. That's the layer's, so sessions on one stack
  share it.
  - It's the origin allowing a stale response, so a request that doesn't
    want one, with `max-age` or `min-fresh` and without `max-stale`, is
    revalidated first.
- The cache mode is `ctx.cacheMode`, not on the request, because Node.js's
  `fetch` refuses `only-if-cached` there unless the mode is `same-origin`,
  and then sends it. As in the Fetch standard, a request that's already
  conditional bypasses the cache, and `only-if-cached` with nothing stored
  is a network error. A request's `no-store` only says not to store (RFC
  9111 §5.2.1.5), so a stored response still answers it.
- Ranges aren't done: a request with a `Range` bypasses the cache, and a
  206 isn't stored (§3.3). `only-if-cached` can't send, so a stored
  response answers it whole (RFC 9110 §14.2).
- A successful request with a method that isn't safe (RFC 9110: `GET`,
  `HEAD`, `OPTIONS`, `TRACE`) invalidates its URL, and its `Location` and
  `Content-Location` on the same origin. Methods are case-sensitive, so
  `patch` invalidates too. A header that isn't a URL is skipped.
  - A response is stored after its body is read, so one on its way when its
    URL is invalidated would put back what was removed. The cache keeps
    what it's sent until it's stored, and an invalidation marks the ones
    for its URL, which then aren't stored.
  - Counting how many times each URL is invalidated was rejected. It
    would grow with every URL ever invalidated. Only what's in flight is kept.
- A response is stored from a clone while the caller reads it. Once the
  clone is bigger than `maxBodySize`, 16 MB by default, it's cancelled and
  nothing is stored. What's read is the size, because `Content-Length` can
  be missing or compressed. 16 MB is many times the biggest schema in
  SchemaStore, 815 KB.
  - No limit was rejected. A memory cache would read on without end after
    the caller stopped.
  - A limit on the URLs `MemoryCacheStore` keeps was rejected. It doesn't
    limit memory.
- A stored response keeps only the request headers its `Vary` names, so a
  credential isn't kept, in memory or on disk, with a response that
  doesn't vary by it. Keeping every request header was rejected for that.
- Bodies are stored decoded, as runtimes give them, without
  `Content-Encoding`. Headers about one connection aren't stored.
- Each redirect step is a response of its own and is stored like any other
  (see [Redirects](redirects.md)).
- Only `http:` and `https:` go through it. Anything else is `"bypass"`.
  Only HTTP has caching, and a file is read each time, so it's current.
- In a browser it throws (`#http-cache`). The browser's cache is below
  anything a page adds, so a second one only keeps copies.
- A store that fails never fails a request. It's a miss, and
  `onStoreError` is told.
- The store is a `CacheStore` of data by URL and `Vary` variant, and the
  cache does all the HTTP. `MemoryCacheStore`, the default, keeps 64 MB,
  least recently used out. `size()` is bytes and a method on every store.
  The store is the layer's, so sessions on a stack share it, like a
  browser's tabs (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).

## Where it goes

Above the layers that send requests, so a hit never sends one.

Rejected:

- `http-cache-semantics`. It doesn't do `stale-while-revalidate` or more
  than one variant for a URL.
- Partial content. Nothing here sends a `Range`, and resuming doesn't work
  for a compressed response, whose stored bytes are decoded.
- A store that does the HTTP. Writing a store would mean writing a cache.

## Known limitations

- Requests for the same URL that miss at the same time are each sent. A
  session's document cache keeps one session from asking twice, so only
  sessions that ask at once send it twice.
