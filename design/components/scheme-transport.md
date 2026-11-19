# The scheme transport (`src/transports/scheme-transport.js`)

The bottom of a stack gives a request to the fetcher for its URL's scheme.

- Schemes are keys with the colon, like `"https:"`, as `URL.protocol` says
  them, so nothing is added to look one up.
- A scheme without a fetcher is a network error, as in browsers.
- `with(schemes)` is a copy with more, or some replaced, so a transport
  never changes.
- `networkFetcher` fetches with the runtime's `fetch`, for `http:`,
  `https:`, and `data:`. It marks `network:start`, with the priority the
  request has then, and `network:response`.
- `networkFetcher` gives the runtime the cache mode (`ctx.cacheMode`), so
  the runtime sends the headers the Fetch standard adds for it, like
  `Pragma: no-cache`, and a browser's own cache follows it. The runtime
  adding them means a browser makes no CORS preflight for them.
  - `only-if-cached` that reaches it is `ERR_CACHE_MISS` and isn't sent,
    because no cache above had it. Node.js's `fetch` would send it.
  - Adding the headers in the session or the HTTP cache was rejected. A
    browser would make a preflight, and its cache wouldn't follow the mode.
  - Letting a browser answer `only-if-cached` with `mode: "same-origin"`
    was rejected. It's one origin, and the HTTP cache layer is how a stack
    has `only-if-cached`.
- A runtime's network error, like Node.js's "fetch failed", doesn't say
  the URL or why, so `networkFetcher` gives one that does, with the
  runtime's cause. An abort is passed on as it is (see [Errors](errors.md)).
- `defaultTransport()` is those three schemes and works in browsers.
  `nodeTransport()` adds `file:` (see [The `file:` scheme](file-scheme.md)).
  Its `schemes` can replace any of them.
