# Request headers

- Headers to send with `http(s):` requests, such as credentials, are a
  `headers` option of `HttpUriSchemePlugin`, like `cache`, because they're
  HTTP's. Setting them is configuring an HTTP plugin in the
  `uriSchemePlugins` config, which replaces the default. The new plugin has
  the default cache unless it's given another (see
  [HTTP cache](http-cache.md)).
- They're by URL, `Record<string, HeadersInit | HeadersFunction>`.
  Documents aren't trusted and can name any URL `allowRetrieval` allows, so
  a fixed set of headers would send credentials to every origin. Only the
  URLs listed get headers, so the safe way is the short way.
- Keys work like `allowRetrieval` entries (see
  [What can be retrieved](allow-retrieval.md)). One that ends with `/` is
  for everything under it, and any other is only for itself. They're
  compared after they're parsed, and a key's fragment is ignored. It's the
  same rule in both places, and prefixes rather than globs for the same
  reasons.
- Keys have to be absolute `http:` or `https:` URLs, or the plugin throws
  when it's created. It doesn't have a context URI to resolve a relative
  one against, and a key with another scheme would never match.
- When several keys match, their headers are merged from the shortest key
  to the longest, so a longer key wins a header both have. An origin can
  have one token and a path under it another.
- A value can be a function of the requested URL, `HeadersFunction`, and
  can be async, so a token can be refreshed. The URL doesn't have its
  fragment, which isn't part of a request. Before 2026-10-31, it had the
  fragment without a cache and didn't with one.
- Until 2026-10-30, `headers` was one function of every URL,
  `(url: URL) => HeadersInit | undefined`. For one token for one API, most
  of it was the origin check, which is the part that's easy to get wrong.
  Keeping it beside the keys was rejected for the reason `allowRetrieval`
  isn't a predicate: whoever used it would be back to writing the check.
  What a prefix can't say, such as any subdomain, could be done with
  `URLPattern` keys if it's needed.
- `Accept` is always the one `retrieve` gives the plugin (`options.accept`),
  because media type plugins depend on it.
- The headers are in the request the HTTP cache sees, so a `Vary` on them is
  respected, and revalidating sends them too. The cache is private and
  shared by every session, so headers belong to the plugin, not a session.
  Responses are cached by URL, so different credentials for different URLs
  can share a plugin. Different credentials for the same URL need different
  plugins, which don't share a cache.
- A redirect is sent with the same headers. `fetch` drops `Authorization`
  and `Cookie` when it redirects to another origin, but not other headers.
