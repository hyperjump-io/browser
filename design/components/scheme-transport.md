# The scheme transport (`src/transports/scheme-transport.js`)

The bottom of a stack gives a request to the fetcher for its URL's scheme.

- Schemes are keys with the colon, like `"https:"`, the way
  `URL.protocol` says them, so nothing is added or removed to look one up.
- A scheme without a fetcher is a network error, as in browsers.
- `with(schemes)` is a copy with more, or some replaced, so a transport is
  never changed after it's made.
- `networkFetcher` fetches with the runtime's `fetch`, which handles
  `http:`, `https:`, and `data:` anywhere `fetch` runs. It marks
  `network:start`, with the priority the request has by then, and
  `network:response`.
- `networkFetcher` gives the runtime an `http:` or `https:` request's
  cache mode (`ctx.cacheMode`), so the runtime sends the headers the Fetch
  standard adds for it, like `Pragma: no-cache` for `reload`, and a cache
  between it and the server doesn't answer. In a browser, the browser's
  own cache follows the mode. The runtime adds them, so a browser doesn't
  make a CORS preflight for them, which it would for a page's own
  `Cache-Control`.
  - `only-if-cached` that reaches the network is a miss,
    `ERR_CACHE_MISS`, because no cache above had it. It isn't sent:
    Node.js's `fetch` has no cache and sends it, and a browser's answers
    it only for its own origin.
  - Giving a browser `only-if-cached` with `mode: "same-origin"` and
    Node.js a miss was rejected. The HTTP cache layer is how a stack has
    `only-if-cached`, and a browser's cache answering it for one origin
    isn't worth a fetcher for each runtime.
  - Adding the headers in the session or the HTTP cache was rejected. A
    browser would make a CORS preflight for them, and its own cache still
    wouldn't follow the mode.
- A runtime's network error doesn't say which URL failed or why, like
  Node.js's "fetch failed", so `networkFetcher` gives one that names the
  URL and its cause's message, with the runtime's cause, like `ENOTFOUND`.
  An abort is given on as it is (see [Network errors](network-errors.md)).
- `defaultTransport()` is those three schemes, and works in browsers too.
  `nodeTransport()` adds `file:`, on a server (see
  [The `file:` scheme](file-scheme.md)). Its `schemes` can replace any
  of them, `file:` too.
