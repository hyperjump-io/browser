# Request headers

- Headers to send with requests, such as credentials, are the `headers`
  config of a `Hyperjump`. The request headers layer of a session's stack
  (`request-headers.js`, see [Layers](layers.md)) adds them to a request,
  and the URL scheme plugin sends them.
  - A `headers` option of `HttpUrlSchemePlugin`, because headers are
    HTTP's, was rejected. Setting them meant replacing the default plugin,
    which a new plugin's `cache` had to account for, and a plugin of the
    application's for another scheme couldn't have them.
- They're by URL, `Record<string, HeadersInit | HeadersFunction>`.
  Documents aren't trusted and can name any URL `allowRetrieval` allows, so
  a fixed set of headers would send credentials to every origin. Only the
  URLs listed get headers, so the safe way is the short way.
- Keys work like `allowRetrieval` entries (see
  [What can be retrieved](allow-retrieval.md)). One that ends with `/` is
  for everything under it, and any other is only for itself. They're
  compared after they're parsed, and a key's fragment is ignored. It's the
  same rule in both places, and prefixes rather than globs for the same
  reasons. The `mediaTypeByExtension` config's URLs are matched the same
  way (`url-entries.js`) (see [Media types](media-types.md)).
- Keys have to be absolute URLs, or the `Hyperjump` throws when it's
  created. It doesn't have a context URL to resolve a relative one against.
  A key can have any scheme, because the layer is for every request, and
  the plugin decides what to send.
- When several keys match, their headers are merged from the shortest key
  to the longest, so a longer key wins a header both have. An origin can
  have one token and a path under it another.
- A value can be a function of the requested URL, `HeadersFunction`, and
  can be async, so a token can be refreshed. The URL doesn't have its
  fragment, which isn't part of a request.
- One function of every URL, `(url: URL) => HeadersInit | undefined`, was
  rejected. For one token for one API, most of it would be the origin
  check, which is the part that's easy to get wrong. A function beside the
  keys was rejected for the reason `allowRetrieval` isn't a predicate:
  whoever used it would be back to writing the check.
  What a prefix can't say, such as any subdomain, could be done with
  `URLPattern` keys if it's needed.
- `Accept` is always the one for the media type plugins, because they
  depend on it. The `Accept` layer is below this one, so it replaces one
  the config gives.
- The `http(s):` plugin sends every header the request has except
  `Referer`. A request's `Referer` can be a file's URL, which a server
  shouldn't see.
  - A `Referer` policy, like a browser's `strict-origin-when-cross-origin`,
    is left out until something needs a server to see where a reference
    came from. It can be added then without changing what's sent by
    default. A `Referer` is a forbidden header in a browser, so `fetch`
    sends the page's referrer by its own policy, and this only matters in
    Node.js.
- The headers are in the request the HTTP cache sees, so a `Vary` on them is
  respected, and revalidating sends them too. The cache is private and
  shared by every session, so headers belong to the `Hyperjump`, not a
  session. Responses are cached by URL, so different credentials for
  different URLs can share a cache. Different credentials for the same URL
  need `Hyperjump`s whose plugins don't share a cache, which each one's
  default plugin doesn't.
- A redirect gets the headers for the URL it leads to, because the session
  follows it with a new request (see [Redirects](redirects.md)). In
  browsers, `fetch` follows redirects and sends the same headers, except
  `Authorization` and `Cookie` on a redirect to another origin.
