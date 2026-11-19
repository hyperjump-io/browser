# HAR export (`src/har.js`)

A trace's records as a HAR 1.2 log, the format browser devtools import and
export, so a trace can be opened in Chrome's or Firefox's network panel.

- Every entry is in one page. Its title is the first `"document"` request's
  URL, or the first request's.
- Each redirect the session followed is an entry of its own, with
  its 3xx status and `redirectURL`, as browsers record them. They're made
  from the `redirect` marks, so only the last step has its response's
  headers. Each step has the headers its request was sent with, which a
  redirect works out again for the URL it leads to. The first step's are
  the record's, and each `redirect` mark has the next one's.
- `Authorization`, `Proxy-Authorization`, `Cookie`, and `Set-Cookie` are
  left out unless `sensitive` is `true`, like Chrome's sanitized HAR. A HAR
  is shared, like in a bug report, and a session's headers can have
  credentials in them.
- `blocked` is the time a request waited in the throttle or the scheduler
  before it first reached the transport, and it's the first step's when a
  request redirected. `wait` is until the response arrived, and `receive` is
  the body. `fetch` doesn't say how long DNS, connecting, or TLS took, so
  they're `-1`, which HAR allows for what isn't known. `time` is the sum of
  the rest.
- A body is in `content.text` if the trace kept bodies: as text for a text
  type, and base64 otherwise.
- HAR allows fields that start with `_`. Chrome reads `_initiator` and
  `_priority`. The priority is the one the layers used, from the marks: as
  the request reached the transport, or as it was asked for. `_source`,
  `_cache`, `_error`, and `_marks` say what the stack did.
- What's made is checked against the HAR 1.2 schema in the tests
  (`har-validator`).

Rejected:

- Giving every step of a redirect the record's request headers. After a
  redirect to another origin, the HAR would say credentials were sent there
  that the session didn't send.

## Known limitations

- A credential in a header with another name, like `X-API-Key`, or in a
  URL's query, is kept. Only those four headers are known to have
  credentials.
