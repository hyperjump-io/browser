# Response meta (`src/response-meta.js`)

What's known about a response that isn't part of it, like which part of the
stack made it, is its meta (see
[Requests and responses are the platform's](../principles/platform-requests-and-responses.md)).

- It's in a `WeakMap` by response, so it goes away with the response.
- It's added to, not replaced (`setResponseMeta`), so each layer adds what
  it knows without knowing what the others said.
- A cloned or rebuilt response doesn't have it, so `cloneResponse` and
  `replaceBody` copy it.
- `trackBody` is how a layer holds something as long as a transfer lasts,
  like a connection slot. It calls `done` once, when the body is read,
  cancelled, or failed. An aborted request fails its body even while
  nothing reads it, so aborting frees what a layer holds. A response
  without a body, or an opaque one, is done right away.
- A made response, like a cache hit, gets its URL with `withUrl`, an own
  property that shadows the getter, because `new Response` can't set it.
- Failures are the `TypeError` `fetch` rejects with (`networkError`), with
  their cause (see [Errors](errors.md)).
