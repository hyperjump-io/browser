# Tracing (`src/trace.js`)

A `Trace` records what a session fetches, like a devtools network panel,
from the session's observers and the records (see
[Fetch records](fetch-records.md)).

- Requests are in start order, and each fills in as it goes. `bodies: true`
  keeps response bodies.
- `tree()` puts each request after its initiator, or at the top if its
  initiator isn't in the trace. `waterfall()` draws it, `░` while waiting
  and `█` while loading.
- Waiting is read from the throttle's and the scheduler's marks, until the
  request first reached the transport. Reading marks is what traces are for
  (see [How layers communicate](../principles/how-layers-communicate.md)).
- `toJSON()` is the records as data, and `toHar()` is a HAR log (see
  [HAR export](har.md)).

Rejected:

- Reading the layers' state, like the scheduler's queue. It shows only
  what's waiting now.
