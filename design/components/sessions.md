# Sessions (`src/session.js`)

A session is the requests that belong together, like a page load's. It sits
on a stack it's given and gives the stack what the stack can't know.

- `new Session(stack, options)` takes the stack as a `Fetcher`, so any stack,
  or any part of one, can be a session's. Without one, it's
  `defaultTransport()`.
- A relative URL is resolved against the context URL, as it is in a
  browser: the working directory in Node.js and the page in a browser
  (`#context-url`). The session reads it once, when it's created, so
  everything the session does sees the same one, and a new session sees a
  change, like a new working directory. Where there's none, like in a
  worker, a relative URL throws `new URL`'s `TypeError`.
- It fetches only what `allowRetrieval` allows, and by default only what's
  local to the application, so a document can't make it fetch whatever it
  names (see [What a session can fetch](allow-retrieval.md)). Only a
  `file:` document can refer to a `file:` URL (see
  [`file:` from `file:`](file-references.md)).
- `headers` are by URL, so only the URLs they're for get them, including
  where a redirect leads. A request's own headers win (see
  [Request headers](request-headers.md)).
- It follows redirects, each step as a new request down the stack, so every
  layer sees each URL (see [Redirects](redirects.md)).
- Every request's signal is the session's and the caller's together
  (`AbortSignal.any`), so closing the session aborts what it started, like
  navigating away, and a closed session refuses new requests with its
  signal's reason.
- `priority` and `initiator` aren't given to `new Request`.
  Runtimes ignore them or reject some values, so the session gives them to
  the stack as context (see [Layers](layers.md)).
- `state(key, init)` is state that lives as long as the session, made the
  first time it's asked for. A layer uses itself as the key, so one stack
  can serve many sessions (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).

Rejected:

- Child sessions: a session nested in another, like an iframe, with its
  parent's options, closed when its parent closes, and seen by its parent's
  observers. There's no use case for one.
- A `baseURL` option, for relative URLs and relative `headers` keys and
  `allowRetrieval` entries. The references that matter are a document's,
  and they resolve against the document's URL, which is its response's.
  A caller with a base of its own resolves against it (`new URL(path,
  base)`). And a base held by the session would decide what's local, so
  `allowRetrieval`'s default would be something other than the working
  directory or the page. An application that fetches from somewhere else,
  like a language server for a workspace, lists it in `allowRetrieval`.
- A stack the session builds from configuration, one for each session, with
  per-session state in the layers' closures. The stack couldn't be shared or
  walked, and state that outlives a session would have to be passed to every
  session (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
- A stack that's private to the session and can't be passed in, because
  calling a stack directly is a way to fetch that `allowRetrieval` doesn't
  check. `allowRetrieval` keeps documents from choosing what's fetched,
  and a document can't call code. Whatever has the stack is the
  application or one of its layers, which could call the runtime's `fetch`
  anyway, so hiding the stack wouldn't take anything away from them (see
  [What a session can fetch](allow-retrieval.md)).
- `fork()`, a sibling with the same options. A sibling is
  `new Session(session.stack, options)`, and `fork` couldn't say which
  options to change without being `new Session` again.
