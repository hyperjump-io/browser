# Layers (`src/layers.js`)

A stack is layers, each wrapping the one below it. A layer answers a
request itself, like a cache hit, changes the request or the response, or
passes the request on.

- Everything that answers a request is a `Fetcher`: a transport, a layer,
  and a whole stack. So a stack can be wrapped again, given to a session,
  or tested by itself.
- A layer has an `inner`, the fetcher it wraps, so a stack can be walked
  (`layersOf`, the library's own) and a layer found by its class
  (`findLayer`), like by an application that purges its cache. A layer
  doesn't find another (see
  [How layers communicate](../principles/how-layers-communicate.md)).
- Each built-in layer is a class whose constructor takes the fetcher it
  wraps, with a function that makes a `Decorator`, like `httpCache()`. A
  class can have methods, like `purge`, and state that outlives a session,
  like a cache store.
- `compose(a(), b())(transport)` is `a()(b()(transport))`, so a stack reads
  from the top down.
- `layer(fn)` and `fetcher(fn)` make one from a function.

## The order

Some layers only work in some places. Each one's document says why.

| Layer | Goes | Because |
| --- | --- | --- |
| `HttpCache` | above the throttle and the scheduler | a hit never waits |
| `Throttle` | above the scheduler | what a page asks for first is what the scheduler gets first |
| `Scheduler` | right above the transport | only requests that are sent use a connection |

Nothing checks the order. An order that's wrong still works, only not as
well.

## The context

A request goes down with its context (`FetchContext`): `session`,
`cacheMode` (see [HTTP cache](http-cache.md)), `priority` (see
[Priorities](priorities.md)), and `record` (see
[Fetch records](fetch-records.md)). A layer can give the one below a changed
copy, but these are the only fields (see
[How layers communicate](../principles/how-layers-communicate.md)).

What aborts a request is its own `signal`. A layer that makes a new request
gives it one.

Rejected:

- A `signal` on the context too. A layer could give one and not the other,
  and `fetch` reads only the request's.
- Layers as a list of `handle(request, ctx, next)` given to the session. A
  layer couldn't have methods, the stack wasn't a value, and a transport
  was a special case.
- A layer that makes identical requests in flight one request. A browser
  doesn't do it for `fetch`, and a document referred to twice is already
  fetched once by the session's documents. Doing it in the HTTP cache would
  only help stacks with a cache (see [HTTP cache](http-cache.md)).
- A layer that batches requests. It needs a server with a batch endpoint.
- `(next) => fetch` functions without a context. A layer couldn't keep
  per-session state, follow a priority, or say what it did.
