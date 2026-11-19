# Sessions (`src/hyperjump.js`)

A session is the requests that belong together, like a page load's. It sits
on a stack it's given and gives the stack what the stack can't know. The
class is `Hyperjump`, and a layer has the session as `ctx.session`.

- `new Hyperjump(config)` takes one configuration object, with the stack in
  it as a `Fetcher`. The configuration is a value an application keeps, so
  another session is `new Hyperjump(config)`. The session has it as
  `config`, so what's built on a session reads its own keys from it, like
  `mediaTypes` (see [Documents](documents.md)).
- Without a stack, a session has a default stack of its own
  (`#default-stack`):
  - In Node.js it's `scheduler()` over `nodeTransport()`. Node.js opens a
    connection for every `fetch`, so 50 requests to one origin would open
    50 connections. `nodeTransport()` has `file:`, which the default
    `allowRetrieval` is for.
  - In a browser it's `defaultTransport()`. A browser limits connections
    itself.
  - It has no HTTP cache. A default stack lives as long as its session, so
    the cache would go with it, and a browser caches already.
  - `defaultStack()` is exported, so sessions that should share one do, as
    `{ stack: defaultStack() }`.
- A relative URL is resolved against the context URL, as in a browser: the
  working directory in Node.js and the page in a browser (`#context-url`).
  It's read once, when the session is created, so everything the session
  does sees the same one. Where there's none, like in a worker, a relative
  URL throws `new URL`'s `TypeError`. `contextUrl` is it, so what's built on
  a session resolves the same way.
- It fetches only what `allowRetrieval` allows (see
  [What a session can fetch](allow-retrieval.md)).
- Only a `file:` document can refer to a `file:` URL (see
  [`file:` from `file:`](file-references.md)).
- `headers` are by URL (see [Request headers](request-headers.md)).
- It follows redirects itself, through the stack (see
  [Redirects](redirects.md)).
- Every response it gives has a URL. One a fetcher or the registry made
  gets the request's, without its fragment, because `new Response` can't
  set one. A fetcher that sets one, like the `file:` scheme's for a
  symbolic link, keeps it.
- Every request's signal is the session's and the caller's together
  (`AbortSignal.any`), so closing the session aborts what it started, and a
  closed session refuses new requests with its signal's reason.
  - It's from `AbortSignal.any` even when the caller gives no signal. In
    Node.js, adding a listener costs as much as the listeners a signal has,
    so requests that followed the session's own signal got slower with
    each one. A signal from `AbortSignal.any` doesn't listen to its
    sources.
- `priority` and `initiator` aren't given to `new Request`, because
  runtimes ignore them or reject some values. They go to the stack as
  context (see [Layers](layers.md)).
- `state(key, init)` is state that lives as long as the session. A layer
  uses itself as the key, so one stack can serve many sessions (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).

Rejected:

- Child sessions, nested like an iframe. There's no use case for one.
- A `baseURL` option. A document's references resolve against its own URL,
  and a caller with a base resolves against it (`new URL(path, base)`). A
  base the session held would also decide what's local, so
  `allowRetrieval`'s default would stop being the working directory or
  the page.
- A stack that's private to the session, because calling the stack directly
  isn't checked by `allowRetrieval`. Whatever has the stack is the
  application or its layers, which could call `fetch` anyway (see
  [What a session can fetch](allow-retrieval.md)).
- `fork()`. A sibling is `new Hyperjump({ ...config, headers })`.
- `new Hyperjump(stack, options)`. An application would keep two values for
  one configuration.
- One default stack shared by every session without one. Sessions that
  never said they belong together would share the scheduler's limits.
- A class that holds the configuration and makes sessions. A plain object
  holds it already.
