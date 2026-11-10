# HAR export (`src/har.js`)

A trace's records as a HAR 1.2 log, the format browser devtools import and
export, so a trace can be opened in Chrome's or Firefox's network panel.

- Every entry is in one page. Its title is the first `"document"` request's
  URL, or the first request's.
- Each redirect the `Redirects` layer followed is an entry of its own, with
  its 3xx status and `redirectURL`, as browsers record them. They're made
  from the `redirect` marks, so only the last step has its headers.
- `blocked` is the time a request waited in the throttle or the scheduler
  before it first reached the transport, and it's the first step's when a
  request redirected. `wait` is until the response arrived, and `receive` is
  the body. `fetch` doesn't say how long DNS, connecting, or TLS took, so
  they're `-1`, which HAR allows for what isn't known. `time` is the sum of
  the rest.
- A body is in `content.text` if the trace kept bodies: as text for a text
  type, and base64 otherwise.
- HAR allows fields that start with `_`. Chrome reads `_initiator`,
  `_resourceType` (from the destination), and `_priority`. The priority is
  the one the layers used, from the marks: as the request reached the
  transport, or as a layer gave it, like `DestinationPriority`, or as it was
  asked for. `_source`, `_cache`, `_error`, and `_marks` say what the stack
  did.
- What's made is checked against the HAR 1.2 schema in the tests
  (`har-validator`).

Rejected:

- A page for each session. A child session is like a frame, which is part of
  its page in a browser's HAR.
