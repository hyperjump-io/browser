# HAR export (`src/har.js`)

A trace's records as a HAR 1.2 log, so a trace opens in Chrome's or
Firefox's network panel.

- Every entry is in one page, titled with the first request's URL.
- Each redirect the session followed is an entry of its own, as browsers
  record them, made from the `redirect` marks. Only the last step has its
  response's headers. Each step has the request headers it was sent with,
  which change at each redirect.
- `Authorization`, `Proxy-Authorization`, `Cookie`, and `Set-Cookie` are
  left out unless `sensitive` is `true`, like Chrome's sanitized HAR,
  because a HAR is shared.
- `blocked` is the time waiting in the throttle or the scheduler. `fetch`
  doesn't say DNS, connect, or TLS times, so they're `-1`, which HAR allows.
- Bodies the trace kept are text for a text type and base64 otherwise.
- Chrome reads `_initiator` and `_priority`. `_source`, `_cache`, `_error`,
  and `_marks` say what the stack did.
- Tests check the output against the HAR 1.2 schema (`har-validator`).

Rejected:

- The record's request headers on every redirect step. After a redirect to
  another origin, the HAR would show credentials the session didn't send
  there.

## Known limitations

- A credential in another header, like `X-API-Key`, or in a query, is kept.
