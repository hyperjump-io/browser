# Requests and responses are the platform's

Every layer takes the platform's `Request` and returns its `Response`, so a
layer is written the way any web code is, and a stack works with anything
that speaks `fetch`.

- Nothing subclasses `Request` or `Response`. A layer that makes a new one,
  as most do, would lose a subclass's properties.
- What's known about a response that isn't part of it, like whether it came
  from the cache, is kept outside it, in a `WeakMap` by response
  (`responseMeta`). A response stays standard, and a layer that makes a new
  one copies what it needs (`cloneResponse`, `replaceBody`).
- A response that's made, rather than fetched, gets the URL it's for
  (`withUrl`), because `new Response` can't set it and every fetched
  response has one.

Rejected:

- Headers for what isn't HTTP, like an `X-Cache` header for a cache hit. A
  layer below could send one, and a response's headers are what the server
  said.
