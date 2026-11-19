# Redirects (`src/redirects.js`)

The session follows redirects one at a time, each as a new request down the
stack, so every layer sees each URL: the HTTP cache stores a cacheable 301,
a layer that answers a URL answers where a redirect leads, and the
scheduler sees the URLs really fetched.

It follows the Fetch standard: `redirect` is `"follow"`, `"error"`, or
`"manual"`, methods change on 301, 302, and 303, a 307 or 308 sends the
body again, so a request with a body is cloned before each step, and a URL
without a fragment gets the original's.

- `Authorization`, `Cookie`, and `Proxy-Authorization` aren't sent to
  another origin. The Fetch standard drops only `Authorization`, because a
  page can't set the others, but a server can, and Node.js's `fetch` drops
  all three.
- More than `maxRedirects` (20) is a network error. One that isn't a whole
  number from 0, or `Infinity`, is a `RangeError` when the session is
  created. `NaN` would never end a loop.
- A `Location` that isn't a URL, or has a username or password, is
  `ERR_INVALID_REDIRECT`. A `Request` can't be made for a URL with one.

It's stricter than `fetch`: a redirect only leads to a scheme in
`redirectSchemes`, `http:` and `https:` by default, and to a URL
`allowRetrieval` allows. Both are checked before it's followed.

A redirect never leads to `file:`, and `redirectSchemes` with it throws a
`TypeError`. A server can't choose which of the application's files are
read. A file a URL should answer with is the registry's or a layer's.

- `file:` as an opt-in was rejected. Any server the session fetches from
  could read any allowed file, as a `file:` document whose references read
  more, and the stack can't tell a layer's redirect from a server's.
- Ignoring `file:` in `redirectSchemes` was rejected. A session would seem
  to allow what it doesn't.

Each step gets the session's headers for its own URL (see
[Request headers](request-headers.md)), and the request's own headers, as
in `fetch`.

- The response has `redirected`, its final `url`, and
  `responseMeta(response).redirects`. Each step marks `redirect` on the
  request's record, and has its context.
- Each step is asked with `redirect: "manual"`. Node.js, Deno, and Bun
  return the 3xx, and a browser returns an opaque redirect:
  - With `"manual"`, it's the response. With `"error"`, it's
    `ERR_UNEXPECTED_REDIRECT`.
  - With `"follow"`, the request is sent again with `redirect: "follow"`,
    without the session's headers, if its method is idempotent (RFC 9110
    §9.2.2). Otherwise it's `ERR_REDIRECT_NOT_FOLLOWED`, whose message says
    the request was sent.
  - Sending every request again was rejected. A `POST` would reach the
    server twice.
  - Sending with `"follow"` in the first place was rejected. The session's
    headers for the first URL would go wherever it leads, and the session
    would have to know it's in a browser.
  - Returning the opaque redirect for `"follow"` was rejected. It's a
    response the caller can't read, as if it were the answer.
  - Sending it again with the session's headers was rejected. The browser
    sends them wherever the server says, so a credential wouldn't stay with
    its URL.
- `maxRedirects` and `redirectSchemes` are session options. They're about
  what a session fetches, not how the stack fetches.
- A stack called without a session returns the 3xx.

Rejected:

- A `Redirects` layer at the top of the stack. A layer above saw only the
  first request, nothing checked it was at the top, and what's decided for
  each URL would have to be below it.
- Letting the runtime follow them. Layers would see only the first URL, the
  cache couldn't store a redirect, and a server could send a request
  anywhere the transport goes.

## Known limitations

- A request's own headers follow every step, so a credential like
  `X-API-Key` goes wherever a redirect leads. A credential that should stay
  with its URL goes in the session's `headers`.
- In a browser, the browser follows redirects. Layers see only the first
  request, its rules apply instead of `redirectSchemes`, and only the final
  URL is checked against `allowRetrieval`, after it was sent.
- In a browser, a redirect with `"follow"` is sent twice, once to learn it's
  a redirect and once to follow it, and where it leads gets none of the
  session's headers, even its own.
