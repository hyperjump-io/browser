# Layers (`src/layers.js`)

A stack is layers, each wrapping the one below it, like the web's layered
system. A layer answers a request itself, like a cache hit, changes the
request or the response, or passes the request to the layer below.

- Everything that answers a request is a `Fetcher`: a transport, a layer, and
  a whole stack. A stack is a fetcher, so it can be wrapped again, given to a
  session, or tested by itself.
- A layer is a fetcher with an `inner`, the fetcher it wraps, so a stack can
  be walked (`layersOf`) and a layer found in it by its class
  (`findLayer`). That's for code that uses a stack, like an application that
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

## The context

A request goes down the stack with its context (`FetchContext`): the
session, the cache mode, the signal, the priority, the destination, and the
record. A layer
can give the one below it a changed copy, like a shared request's signal,
but these are the only fields (see
[How layers communicate](../principles/how-layers-communicate.md)).

- `session` is for a layer's per-session state, and its signal.
- `cacheMode` is the Fetch standard's cache mode, for the HTTP cache (see
  [HTTP cache](http-cache.md)).
- `signal` aborts when the caller aborts or the session closes. A request's
  own signal is the same, but a layer that makes a new request can give it
  another, so the context has it too.
- `priority` is a signal that can change while a request waits (see
  [Priorities](priorities.md)).
- `destination` is what the resource is for, like `"style"` or `"image"`,
  as `Request.destination` is in a browser. A script can't set
  `Request.destination`, so it's on the context.
- `record` is where a layer says what it did (see
  [Fetch records](fetch-records.md)).

Rejected:

- Layers as a list given to the session, each a `handle(request, ctx,
  next)`. A layer couldn't have methods an application calls, the stack
  wasn't a value that could be passed around, and a transport was a special
  case instead of a fetcher.
- `(next) => fetch` functions without a context. A layer couldn't keep state
  for a session, follow a priority that changes, or say what it did.
