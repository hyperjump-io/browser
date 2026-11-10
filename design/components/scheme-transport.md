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
- `defaultTransport()` is those three schemes, and works in browsers too.
  `nodeTransport()` adds `file:`, on a server (see
  [The `file:` scheme](file-scheme.md)).
