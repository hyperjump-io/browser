# Sessions (`src/session.js`)

A session is the requests that belong together, like a page load's. It sits
on a stack it's given and gives the stack what the stack can't know.

- `new Session(stack, options)` takes the stack as a `Fetcher`, so any stack,
  or any part of one, can be a session's. Without one, it's
  `defaultTransport()`.
- A relative URL is resolved against `baseURL`, like a document's base URL.
- `headers` are added to every request that doesn't have them, so a
  request's own headers win.
- Every request's signal is the session's and the caller's together
  (`AbortSignal.any`), so closing the session aborts what it started, like
  navigating away, and a closed session refuses new requests with its
  signal's reason.
- `priority`, `destination`, and `initiator` aren't given to `new Request`.
  Runtimes ignore them or reject some values, so the session gives them to
  the stack as context (see [Layers](layers.md)).
- `state(key, init)` is state that lives as long as the session, made the
  first time it's asked for. A layer uses itself as the key, so one stack
  can serve many sessions (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).

## Child sessions

`child(options)` is a session nested in this one, like an iframe.

- It has the same stack.
- Its base URL is resolved against its parent's, and it has its parent's
  headers unless it's given its own.
- Its state is its own. A layer that shares state with its parent uses
  `root`, the top of the chain, or `lineage()`, the session and its parents
  in order.
- Closing a parent closes its children. Closing a child leaves its parent
  open.
- Its requests are seen by its parents' observers (see
  [Fetch records](fetch-records.md)).

Rejected:

- A stack the session builds from configuration, one for each session, with
  per-session state in the layers' closures. The stack couldn't be shared or
  walked, and state that outlives a session would have to be passed to every
  session (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
- `fork()`, a sibling with the same options. A sibling is
  `new Session(session.stack, options)`, and `fork` couldn't say which
  options to change without being `new Session` again.

## Known limitations

- `headers` go to every URL the session fetches, on every origin, including
  where a redirect leads. A credential in them goes everywhere. Only
  `Authorization` is dropped on a redirect to another origin, by the
  `Redirects` layer.
- Nothing limits what a session can fetch. An application that fetches URLs
  from documents it doesn't trust has to check them, in a layer of its own.
