# The throttle (`src/layers/throttle.js`)

A page's low-priority requests are held back while its important ones load,
like Chrome's resource scheduler, so analytics, prefetches, and images below
the fold don't compete with the stylesheet the page is waiting for.

- A request is delayable when `isDelayable` says so, which by default is
  when its priority is `low`. Anything else is important, and is never held
  back.
- While any important request of the page is in flight, only
  `maxDelayableWhileBusy` delayable ones can be (1). Otherwise,
  `maxDelayable` can be (10). Held requests start by priority, then in the
  order they came.
- A held request whose priority changes so it isn't delayable starts right
  away, as an important request.
- A page is a session and its children (`scope: "root"`, the default), like a
  page and its frames, so a frame's low-priority requests wait for its
  page's important ones. `scope: "session"` throttles each session by
  itself.
- Its counts are a page's, in the root session's state. The scheduler's
  limits are the network's, on the layer. They answer different questions:
  what a page asks for first, and how many requests the network carries at
  once (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
- A request counts as in flight until its body is done (`releaseOn`, as for
  the scheduler).
- A held request marks `throttle:held` and `throttle:released`.

## Where it goes

Below the HTTP cache, so a hit isn't held, and above the scheduler, so what
a page asks for first is what the scheduler gets first.

Rejected:

- Throttling in the scheduler. Its state is the network's, shared by every
  session, and the throttle's is a page's.
- The phases Chrome has, like treating requests differently before the
  body of the document has started. A session doesn't know about documents.
