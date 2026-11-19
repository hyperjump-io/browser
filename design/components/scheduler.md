# The scheduler (`src/layers/scheduler.js`)

Connection limits and priorities. A request over a limit waits, and waiting
requests start by priority as slots free up.

- The limits are for each key, an `http:` or `https:` request's origin by
  default (`perKey`, 6, the HTTP/1.1 limit browsers use), and for all keys
  (`total`, 256, like Chrome's for a profile). Other schemes aren't
  limited. `perKey` can be a function, like more for an HTTP/2 origin.
- Waiting requests start `high`, then `auto`, then `low`, each in the order
  they came. A request that can start right away does, whatever its
  priority, as in browsers. A release starts every request that can, so
  this never jumps ahead of one that could have started.
- A waiting request whose priority changes moves among its new peers by
  when it came. A change after it started does nothing (see
  [Priorities](priorities.md)).
- A request holds its slot until its body is done, which is when a
  browser's connection is free. `releaseOn: "headers"` frees it at the
  response.
- Aborting a waiting request takes it out, unsent. Aborting one with a
  response fails its body, which frees its slot.
- Its counts and queue are the layer's, shared by every session on the
  stack, because connection limits are the network's (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
- It marks `scheduler:queued`, with its key and how many were ahead, and
  `scheduler:start`.

## Where it goes

Right above the transport, so only requests that are sent use a slot.

Rejected:

- Limits for each session. A browser's tabs share its connections.

## Known limitations

- A body nobody reads, cancels, or aborts holds its slot, as Node.js's
  `fetch` holds a connection.
