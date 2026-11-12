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
- A runtime's network error doesn't say which URL failed or why, like
  Node.js's "fetch failed", so `networkFetcher` gives one that names the
  URL and its cause's message, with the runtime's cause, like `ENOTFOUND`.
  An abort is given on as it is (see [Network errors](network-errors.md)).
- `defaultTransport()` is those three schemes, and works in browsers too.
  `nodeTransport()` adds `file:`, on a server (see
  [The `file:` scheme](file-scheme.md)).
