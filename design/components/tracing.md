# Tracing (`src/trace.js`)

A `Trace` records what a session and its children fetch, like a network
panel in devtools, from the session's observers and the requests' records
(see [Fetch records](fetch-records.md)).

- It records each request when it starts, so its list is in start order, and
  each record fills in as the request goes.
- `children: false` leaves out the requests of child sessions. `bodies: true`
  asks the session to keep response bodies.
- `tree()` puts each request after the one that initiated it. A request
  whose initiator isn't in the trace is at the top.
- `waterfall()` draws one row for each request, indented under its
  initiator, with its destination, where its response came from, its
  status, and a bar: `░` while it waited in the throttle or the scheduler,
  `█` while it loaded. A request that joined another says which. A failure's
  status is `ERR`.
- What a request waited for is read from the throttle's and the scheduler's
  marks: from when it started to when it first reached the transport. Later
  steps of a redirect aren't waiting. Reading marks is what traces are for
  (see [How layers communicate](../principles/how-layers-communicate.md)).
- `toJSON()` is the records as data.

Rejected:

- A trace that reads the layers' state, like the scheduler's queue. It would
  only show what's waiting now, not what each request did.
