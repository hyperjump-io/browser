# Redirects (`src/hyperjump/redirects.js`)

A session follows redirects itself, with the redirects layer at the top of
its stack (see [Layers](layers.md)). A URL scheme plugin returns a redirect
(301, 302, 303, 307 or 308 with a `Location`) and the layer sends a new
request for where it leads down the stack, to the plugin for that URL's
scheme.

- Each URL a redirect leads to is checked against `allowRetrieval` before
  it's retrieved, because the layer is above it (see
  [What can be retrieved](allow-retrieval.md)). So a
  document can't make an application send a request to a URL it refused,
  such as an internal address.
- Each request gets the headers for its own URL, because each one is a new
  request through the layers below, and a new `retrieve` by the plugin (see [Request headers](request-headers.md)). A
  token for one URL isn't sent to wherever its server redirects.
- Letting `fetch` follow redirects was rejected. Headers would be chosen
  once for the URL that was asked for, and `fetch` sends them on to
  wherever a redirect leads. It drops `Authorization` and `Cookie` on a
  redirect to another origin but not other headers, such as `X-API-Key`.
  `allowRetrieval` could only refuse the response, after the request had
  been sent.
  - The plugin following redirects itself was rejected. It would have
    fixed the headers but not `allowRetrieval`, which the plugin doesn't
    have. Giving it the list or a function to check it would have
    duplicated the session's check and its errors, which say which list to
    change. Returning the redirect gives the session what it needs to
    decide, so the plugin doesn't depend on anything.
- A redirect is requested with the same headers as the request that was
  redirected. Its `Referer` is still the document the reference came
  from, so `file:` from `file:` still refuses a file for a document on the
  web, whatever led there.
- The `http(s):` plugin only returns a redirect to an `http:` or `https:`
  URL, like `fetch`. Anything else is an `HttpError`. Otherwise a server
  could send a session to a file it allows, when there's no
  `Referer` for `file:` from `file:` to refuse, such as a URL an
  application passes to `get`.
- A plugin for a scheme that maps to another URL, like `urn:`, redirects to
  it with `Response.redirect`. The mapped URL is checked before it's
  retrieved. It can be any scheme, such as a `file:` URL, because the
  plugin is the application's own code. Only the `http(s):` plugin limits
  where a redirect leads, because its redirects come from a server.
  - An `options.retrieve`, for a plugin to retrieve another URL with the
    plugin for its scheme, was rejected. It wouldn't be checked against
    `allowRetrieval`, only the URL of the response after the fact. It also
    needed rules of its own: without options, it had to be given the
    retrieval's, so a plugin that left them out didn't lose
    `referencedFrom`. A redirect does all of that with nothing to add. A
    plugin can't wrap another scheme's response, but nothing needs to.
- A `Location` comes from outside, so it's parsed, and one that isn't a URL
  fails the retrieval with `new URL`'s `TypeError` as its cause (see
  [Identifiers are URLs](../principles/identifiers-are-urls.md)).
- A relative `Location` is resolved against the URL of the response that
  redirected. Its fragment is dropped, because a fragment isn't part of
  what's retrieved. `get` uses the fragment that was asked for, not one in a
  `Location`.
- Redirects are followed at most 20 times, like `fetch`, and then the
  layer throws, which fails the retrieval. That's also how a redirect cycle ends. Following a
  redirect with `getDocument`, to reuse the session's cache, was rejected:
  a cycle would wait for its own document forever.
- A document is cached under the URL that was asked for and the URL its
  response came from (see [Sessions](sessions.md)). URLs in the
  middle of a chain aren't. The HTTP cache keeps a redirect like any other
  response, by its own URL, when it's cacheable, such as a 301 or a 308
  (see [HTTP cache](http-cache.md)).
- A redirect status without a `Location` isn't a redirect. It isn't a
  representation either, so the session gives an `HttpError` for it,
  like any status it can't parse (see
  [Errors are responses](layers.md#errors-are-responses)). The session
  parses only a `200` or a `203`. 300 and 304 aren't redirects.

## Browsers

- A browser's `fetch` with `redirect: "manual"` returns an opaque redirect,
  without its status or `Location`, so there's nothing to follow. In
  browsers, the `http(s):` plugin lets `fetch` follow redirects
  (`#redirect-mode`). There, headers are sent to wherever a redirect leads,
  except `Authorization` and `Cookie` on a redirect to another origin, and
  the redirected request is sent before its URL is checked. The session
  still checks the URL the response came from, so a response from a
  refused URL isn't used.
  - Server-side request forgery doesn't apply in a browser. A page can
    already send those requests itself, and CORS keeps their responses
    from it.
  - Refusing redirects with `redirect: "error"` for requests that have
    headers from the `headers` config was considered and left out for now.
