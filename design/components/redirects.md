# Redirects (`src/redirects.js`)

The session follows redirects one at a time, each as a new request down the
stack, instead of letting the runtime follow them inside the transport.
Every layer sees each URL:

- the HTTP cache stores a redirect as a response of its own, so a cacheable
  301 saves a round trip;
- the registry and the resource map answer where a redirect leads, and a
  registry entry can be a redirect, which makes it an alias;
- the scheduler sees the URLs that are really fetched.

It follows the Fetch standard:

- `redirect: "follow"`, `"error"`, or `"manual"`, from the request.
- A 301 or 302 makes a `POST` a `GET`, and a 303 makes anything but `GET` or
  `HEAD` a `GET`, without the body or the headers about it. A 307 or 308
  sends the method and body again, so a request with a body is cloned before
  each step, to have the body for the next.
- `Authorization` isn't sent to another origin.
- A URL a redirect leads to without a fragment gets the original's.
- More than 20 redirects (`maxRedirects`) is a network error.

And it's stricter than `fetch` in two ways: a redirect can only lead to
`http:` or `https:` (`redirectSchemes`), so a server can't send a request to
`file:`, even when the transport has it, and only to a URL the session's
`allowRetrieval` allows (see [What a session can fetch](allow-retrieval.md)).
Both are checked before the redirect is followed.

The session's headers are for the URL each step leads to, not the ones the
step before it got (see [Request headers](request-headers.md)). The
request's own headers go to each step, as in `fetch`.

- The response has its final `url`, `redirected`, and the URLs it went
  through as `responseMeta(response).redirects`. Each redirect marks
  `redirect` on the request's record, with its status and where it went
  from and to. Every step has the request's context and record.
- It asks the stack for each step with `redirect: "manual"`. Node.js, Deno,
  and Bun return the 3xx. A browser returns an opaque redirect, which
  doesn't say where it leads, so the session asks again with the request's
  own mode and the browser follows it.
- `maxRedirects` and `redirectSchemes` are session options, and a child
  session has its parent's unless it's given its own. What a session may be
  sent to is about what it fetches, not about how the stack fetches it.
- A stack that's called without a session returns a 3xx as it is, like
  `redirect: "manual"`.

Rejected:

- A `Redirects` layer at the top of the stack. A layer above it saw only
  the first request, so a redirect to a URL that layer answers went past it,
  and nothing checked that it was at the top. What has to be decided for
  each URL a session fetches, like which headers it gets, would have to be
  below it, or it would see only the first URL.
- Letting the runtime follow them. The layers would see only the first URL,
  the cache couldn't store a redirect, and a server could redirect a request
  anywhere the transport goes.

## Known limitations

- In a browser, the browser follows redirects, so the layers see only the
  first request, and its rules apply instead of `redirectSchemes`. Only the
  URL it led to is checked against `allowRetrieval`, after the request was
  sent.
