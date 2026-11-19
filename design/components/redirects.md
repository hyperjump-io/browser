# Redirects (`src/redirects.js`)

The session follows redirects one at a time, each as a new request down the
stack, instead of letting the runtime follow them inside the transport.
Every layer sees each URL:

- the HTTP cache stores a redirect as a response of its own, so a cacheable
  301 saves a round trip;
- a layer that answers a URL itself answers where a redirect leads, and it
  can answer with a redirect, which makes a URL an alias;
- the scheduler sees the URLs that are really fetched.

It follows the Fetch standard:

- `redirect: "follow"`, `"error"`, or `"manual"`, from the request.
- A 301 or 302 makes a `POST` a `GET`, and a 303 makes anything but `GET` or
  `HEAD` a `GET`, without the body or the headers about it. A 307 or 308
  sends the method and body again, so a request with a body is cloned before
  each step, to have the body for the next.
- `Authorization`, `Cookie`, and `Proxy-Authorization`, the credentials
  HTTP defines, aren't sent to another origin. The Fetch standard drops
  only `Authorization`, because a page can't set the others: a browser
  sends its own cookies for each origin. On a server, a request can have
  them, and Node.js's `fetch` drops all three, so the session does too.
- A URL a redirect leads to without a fragment gets the original's.
- More than 20 redirects (`maxRedirects`) is a network error.

And it's stricter than `fetch` in two ways: a redirect can only lead to
`http:` or `https:` (`redirectSchemes`), and only to a URL the session's
`allowRetrieval` allows (see [What a session can fetch](allow-retrieval.md)).
Both are checked before the redirect is followed.

A redirect can never lead to `file:`, even when the transport has it, and
`redirectSchemes` can't have it: the session's constructor throws a
`TypeError`. A redirect is what a server says, and a server can't choose
which of the application's files a request reads. A file the application
wants a URL to answer with is the registry's, or a layer's that answers
the URL with it (see [`file:` from `file:`](file-references.md)).

- `file:` in `redirectSchemes` as an opt-in was rejected. A redirect from
  any server the session fetches from would read any file
  `allowRetrieval` allows, for the application's own requests and a
  `file:` document's, and what it read would be a `file:` document whose
  references can read more. The stack can't tell a redirect a layer made
  from one a server made, and nothing needs a redirect for what the
  registry and a layer already do.
- Ignoring `file:` in `redirectSchemes` was rejected. A session made with
  it would seem to allow what it doesn't.

The session's headers are for the URL each step leads to, not the ones the
step before it got (see [Request headers](request-headers.md)). The
request's own headers go to each step, as in `fetch`.

- The response has its final `url`, `redirected`, and the URLs it went
  through as `responseMeta(response).redirects`. Each redirect marks
  `redirect` on the request's record, with its status and where it went
  from and to. Every step has the request's context and record.
- It asks the stack for each step with `redirect: "manual"`. Node.js, Deno,
  and Bun return the 3xx. A browser returns an opaque redirect, which
  doesn't say where it leads.
  - With `redirect: "manual"`, the opaque redirect is the response, as it
    is from a browser's `fetch`. With `"error"`, it's a network error,
    `ERR_UNEXPECTED_REDIRECT`. Neither sends the request again.
  - With `"follow"`, the session asks again with `redirect: "follow"`, and
    the browser follows it. It's asked without the session's headers. They
    were for the first URL, and the browser sends a request's headers to
    every URL it's redirected to, so a credential like `X-API-Key` would
    go wherever the server said. The request's own headers go, as they do
    to each step in Node.js.
  - Asking again with the session's headers was rejected. The session
    can't see where the redirect leads, so it can't keep its promise that
    a credential goes only to the URLs it's for.
- `maxRedirects` and `redirectSchemes` are session options. What a session
  may be sent to is about what it fetches, not about how the stack fetches
  it.
- A stack that's called without a session returns a 3xx as it is, like
  `redirect: "manual"`.
- A `Location` that isn't a URL is a network error, as in the Fetch
  standard, `ERR_INVALID_REDIRECT`, Chrome's name for it. So is one with a
  username or password, because a `Request` can't be made for a URL that
  has one.

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

- The Fetch standard follows a redirect to a URL with a username or
  password unless it's to another origin in `cors` mode. A `Request` can't
  be made for one, so it's a network error here.

- In a browser, the browser follows redirects, so the layers see only the
  first request, and its rules apply instead of `redirectSchemes`. Only the
  URL it led to is checked against `allowRetrieval`, after the request was
  sent.
- In a browser, a request that's redirected with `redirect: "follow"` is
  sent twice: once to learn that it's a redirect, and once for the browser
  to follow it. A `POST` reaches the server twice. A browser's `fetch`
  can't say where a redirect leads without following it.
- In a browser, where a redirect leads gets none of the session's headers,
  even one for its own URL. A redirect to a URL that needs a credential,
  like one that adds a trailing `/`, fails as it would without one.
