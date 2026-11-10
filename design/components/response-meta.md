# Response meta (`src/response-meta.js`)

What's known about a response that isn't part of it, like which part of the
stack made it, is its meta (see
[Requests and responses are the platform's](../principles/platform-requests-and-responses.md)).

- It's kept in a `WeakMap` by response, so a `Response` stays standard and
  its meta goes away with it.
- Meta is added to, not replaced (`setResponseMeta`), so each layer adds
  what it knows without knowing what the others said.
- A response that's cloned or rebuilt doesn't have the original's meta, so
  the functions that make them copy it: `cloneResponse`, and `replaceBody`,
  for a layer that wraps a body.
- `trackBody` is how a layer holds something for as long as a transfer
  lasts, like a connection slot. It calls `done` once, when the body has
  been read to the end, cancelled, or has failed. A response without a
  body, or an opaque one, is done right away, because there's nothing to
  wait for and an opaque response can't be rebuilt.
- A response that's made, like a cache hit, gets the URL it's for
  (`withUrl`). The `Response` constructor can't set it, so it's an own
  property that shadows the prototype's getter.
- Failures are the `TypeError` `fetch` rejects with (`networkError`), with
  what caused it as its `cause` (see
  [Like a web browser](../principles/like-a-web-browser.md)).

Rejected:

- A `Response` subclass with the meta as properties. A layer that makes a
  new response, like a cache hit, would make a plain one and lose them.
- Meta in headers. A response's headers are what the server sent, and a
  server could send the same header.
