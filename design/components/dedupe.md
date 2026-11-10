# Dedupe (`src/layers/dedupe.js`)

Requests that are the same, made while one is in flight, are one request,
the way a browser loads an image once when a page uses it twice.

- Each caller gets its own clone of the response. When every caller has
  one, the original's part of the tee is cancelled, so it doesn't fill up.
- By default, `GET` and `HEAD` requests with the same method, URL, cache
  mode, and headers are the same. `key` decides otherwise, and `undefined`
  leaves a request out.
- What's in flight is kept for a scope: each session (`"session"`, the
  default), or a session and its children (`"root"`), so a frame joins a
  request its page started.
- The shared request belongs to its scope. It's sent with the scope's
  session and signal, not the first caller's, so a caller that aborts, or a
  frame that closes, ends only its own wait (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
- When every caller gives up before the response arrives, the shared request
  is stopped, like a browser stopping a load nobody wants, and it's taken out
  of what's in flight right away, so the next caller starts a new one
  instead of joining one that's being stopped.
- The shared request's priority is the most urgent of the callers still
  waiting (see [Priorities](priorities.md)). It starts after the turn it's
  made in, so the first caller is in the group before a layer below reads
  it.
- A caller that joins marks `dedupe:joined`, with the record of the request
  it joined.

## Where it goes

Above the HTTP cache, so requests that miss at the same time are one
request.

Rejected:

- `"root"` by default. A frame's requests are the frame's, as they are in a
  browser, unless the application chooses to share them.
- Sharing only by URL. Requests with different headers can get different
  responses.
