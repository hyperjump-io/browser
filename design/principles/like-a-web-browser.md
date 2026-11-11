# Like a web browser

When there's a question of how something should behave, the answer is what a
web browser does, and the standards it follows: the Fetch standard, RFC 9110,
and RFC 9111.

- A session is the requests that belong together, like a page load. Closing
  it cancels what it started, like navigating away. A child session is like
  an iframe.
- The session follows redirects, so every layer sees each step, as a
  browser's HTTP cache does. The layers are in the order a browser checks
  things: what a document says about itself, preloaded resources, requests
  already in flight, the HTTP cache, and the network. Cache hits never wait for a
  connection.
- A failure is a network error, the `TypeError` `fetch` rejects with, as it
  is in a browser: a missing file, an unsupported scheme, a refused
  redirect.
- What a browser shows in devtools, like where a response came from or a
  waterfall of a page load, is available too (see
  [Tracing](../components/tracing.md)).
- Where the browser and the server differ, the server can do what a browser
  can't, like follow redirects one at a time. Where a browser doesn't allow
  something, like reading a redirect's `Location`, the browser behavior is
  the fallback.

Rejected:

- Answering failures with error responses (a 403 for a refusal, a 404 for a
  missing file). That's what a proxy does, not what `fetch` does, and code
  written for `fetch` expects a rejected promise.
