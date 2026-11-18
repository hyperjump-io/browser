# Layers (`src/layers.js`)

A stack is layers, each wrapping the one below it, like the web's layered
system. A layer answers a request itself, like a cache hit, changes the
request or the response, or passes the request to the layer below.

- Everything that answers a request is a `Fetcher`: a transport, a layer, and
  a whole stack. A stack is a fetcher, so it can be wrapped again, given to a
  session, or tested by itself.
- A layer is a fetcher with an `inner`, the fetcher it wraps, so a stack can
  be walked and a layer found in it by its class (`findLayer`). Walking
  it (`layersOf`) is the library's own, so `inner` isn't a promise to
  applications. That's for code that uses a stack, like an application that
  purges its cache. A layer doesn't find another (see
  [How layers communicate](../principles/how-layers-communicate.md)).
- Each built-in layer is a class whose constructor takes the fetcher it
  wraps, and a function that makes a `Decorator` of it, like `httpCache()`.
  A class can have methods, like `purge`, and state that outlives a session,
  like a cache store.
- `compose(a(), b())(transport)` is `a()(b()(transport))`, so a stack reads
  from the top down, the order a request goes through it.
- `layer(fn)` and `fetcher(fn)` make a layer or a fetcher from a function,
  for one that doesn't need a class.

## The order

A layer's place in a stack is what it sees on the way down and up, so some
layers only work in some places. Each one's document says why. Together:

| Layer | Goes | Because |
| --- | --- | --- |
| `HttpCache` | above the throttle and the scheduler | a hit never waits |
| `Throttle` | above the scheduler | what a page asks for first is what the scheduler gets first |
| `Scheduler` | right above the transport | only requests that are sent use a connection |

Nothing checks the order. A stack is a value an application builds, and an
order that's wrong still works, only not as well.

## The context

A request goes down the stack with its context (`FetchContext`): the
session, the cache mode, the priority, and the record. A layer can give
the one below it a changed copy, like a lower priority, but these are the
only fields (see
[How layers communicate](../principles/how-layers-communicate.md)).

- `session` is for a layer's per-session state, and its signal.
- `cacheMode` is the Fetch standard's cache mode, for the HTTP cache (see
  [HTTP cache](http-cache.md)).
- `priority` is a signal that can change while a request waits (see
  [Priorities](priorities.md)).
- `record` is where a layer says what it did (see
  [Fetch records](fetch-records.md)).

What aborts a request is its own `signal`, which aborts when the caller
aborts or the session closes. A layer that makes a new request gives it a
signal, like the session's for a request that belongs to the session.

Rejected:

- A `signal` on the context as well as the request's. A layer that made a
  new request could give one and not the other, and the runtime's `fetch`
  reads only the request's, so a request a layer below stopped waiting for
  could still be sent.
- Layers as a list given to the session, each a `handle(request, ctx,
  next)`. A layer couldn't have methods an application calls, the stack
  wasn't a value that could be passed around, and a transport was a special
  case instead of a fetcher.
- A layer that makes requests that are the same, in flight at once, one
  request. A browser doesn't do it for `fetch`, where two calls are two
  requests, and what it's for, a document referred to twice, is a session's
  document cache's: a document that's being fetched or parsed is found by
  its URL, so a second reference waits for it instead of fetching again.
  Sharing them in the HTTP cache, as a browser's cache does, was rejected
  too, because only a stack with a cache would share them (see
  [HTTP cache](http-cache.md)).
- A layer that collects requests made at about the same time and sends
  them together as one. It needs a server with a batch endpoint, and
  sending a few at a time is the scheduler's.
- `(next) => fetch` functions without a context. A layer couldn't keep state
  for a session, follow a priority that changes, or say what it did.
