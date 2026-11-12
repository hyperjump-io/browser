# Like a web browser

When there's a question of how something should behave, the answer is what a
web browser does, and the standards it follows: the Fetch standard, RFC 9110,
and RFC 9111.

- A session is the requests that belong together, like a page load. Closing
  it cancels what it started, like navigating away. A child session is like
  an iframe.
- The session follows redirects, so every layer sees each step, as a
  browser's HTTP cache does. The layers are in the order a browser checks
  things: the HTTP cache, then the network. Cache hits never wait for a
  connection.
- A failure is a network error, the `TypeError` `fetch` rejects with, as it
  is in a browser: a missing file, an unsupported scheme, a refused
  redirect (see [Network errors](../components/network-errors.md)).
- What a browser shows in devtools, like where a response came from or a
  waterfall of a page load, is available too (see
  [Tracing](../components/tracing.md)).
- Where the browser and the server differ, the server can do what a browser
  can't, like follow redirects one at a time. Where a browser doesn't allow
  something, like reading a redirect's `Location`, the browser behavior is
  the fallback.

Rejected:

- Answering failures with error responses (a 403 for a refusal, a 404 for a
  missing file). A status is what a server says, and for these no server
  answered. A browser that can't find a `file:` URL gives a network error,
  not a 404, and so does Deno's `fetch`. A server that serves files answers
  404 because the server chose to. Code written for `fetch` expects a
  rejected promise too.
  - A layer above a failure could see an error response like any other.
    Here a refusal is the session's, above every layer, so no layer is
    above it. A layer can catch what fails below it, and its `cause.code`
    says why.
