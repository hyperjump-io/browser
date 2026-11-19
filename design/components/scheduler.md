# The scheduler (`src/layers/scheduler.js`)

Connection limits and priorities. A request over a limit waits, and waiting
requests start by priority as slots free up.

- The limits are for each key, an `http:` or `https:` request's origin by
  default (`perKey`, 6, the HTTP/1.1 limit for a host browsers use), and for
  every key together (`total`, 256, like Chrome's limit for a profile).
  Other schemes, like `file:` and `data:`, aren't limited. `perKey` can be
  a function, like more for an origin that's HTTP/2.
- Waiting requests start `high`, then `auto`, then `low`, and in the order
  they came in each. A request that can start right away does, whatever its
  priority, as in browsers. Every waiting request is blocked by a limit,
  because a release starts every one that can, so one that starts right away
  isn't jumping ahead of one that could have.
- A waiting request whose priority changes moves to its place among its new
  peers, by the order it came. A change after it started does nothing (see
  [Priorities](priorities.md)).
- A request holds its slot until its body is read, cancelled, or fails,
  which is when a browser's connection is free, so the limits are on
  transfers, not on requests waiting for headers. `releaseOn: "headers"`
  frees it when the response arrives.
- Aborting a waiting request takes it out of the queue, and it's never sent.
  Aborting one that has its response fails its body, which frees its slot
  even if nothing is reading it. Closing a session aborts its requests, so
  it frees theirs too.
- Its counts and queue are the layer's, so every session on the stack shares
  them, because connection limits are the network's, not a page's (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
- A request that waits marks `scheduler:queued`, with its key and how many
  were ahead of it, and `scheduler:start` when it starts.

## Where it goes

Right above the transport, so only requests that are really sent use a slot.

Rejected:

- Limits for each session. A browser's tabs share its connections.

## Known limitations

- A body nobody reads, cancels, or aborts holds its slot. `fetch` in
  Node.js holds a connection the same way, so bodies need to be read or
  cancelled anyway.
