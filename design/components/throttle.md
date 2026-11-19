# The throttle (`src/layers/throttle.js`)

A page's low-priority requests are held back while its important ones load,
like Chrome's resource scheduler.

- A request can be held when `isDelayable` says so, by default when its
  priority is `low`. Anything else is important and never held.
- While an important request of the page is in flight, only
  `maxDelayableWhileBusy` (1) of the ones that can be delayed are.
  Otherwise `maxDelayable` (10) are. Held requests start by priority, then
  order.
- A held request whose priority no longer lets it be delayed starts right
  away.
- A page is a session. Its counts are in the session's state, and in flight
  means until the body is done (`releaseOn`, as for the scheduler).
- A held request marks `throttle:held` and `throttle:released`.

## Where it goes

Below the HTTP cache, so a hit isn't held, and above the scheduler, so what
a page asks for first is what the scheduler gets first.

Rejected:

- Throttling in the scheduler. Its state is the network's, shared by every
  session, and the throttle's is a page's (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
- Chrome's phases, like before the document's body has started. A session
  doesn't know about documents.
