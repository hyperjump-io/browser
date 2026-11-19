# Request headers (`src/request-headers.js`)

A session adds headers to its requests, like credentials, by the URL each
request is for. Documents aren't trusted and can name any URL. Headers that
went to every URL would send a credential to every origin a document names.
Only the URLs that are listed get headers, so the short way to configure it
is the safe way.

- The session's `headers` option is
  `Record<string, HeadersInit | HeadersFunction>`, keyed by URL.
- A key that ends with `/` is for every URL under it. Any other key is only
  for itself. An origin without a path, like `https://example.com`, parses
  to `https://example.com/`, so it's for the whole origin.
- Keys and requested URLs are compared as parsed URLs, so case, dot
  segments, and default ports can't get around a key. A key's fragment is
  ignored, and a requested URL's fragment isn't part of the request. The
  rule is a pure function of the entries and a URL (`src/url-entries.js`),
  so anything else decided by URL can use the same one.
- A relative key is resolved against the context URL when the session is
  created, as a relative request URL is (see [Sessions](sessions.md)). A
  key that isn't a URL, or a relative key where there's no context URL,
  like in a worker, throws a `TypeError` there.
- A key can have any scheme. The session adds headers before the stack, and
  the transport decides what to send.
- When several keys match, their headers are merged from the shortest key
  to the longest, so a longer key wins a header both have. An origin can
  have one token and a path under it another.
- A value can be a function of the URL, `HeadersFunction`, and it can be
  async, so a token can be refreshed. It's called for each request and each
  redirect, with the URL without its fragment.
- A header the request has itself isn't replaced.
- A URL the session doesn't allow gets none of its headers, and a headers
  function isn't called for it (see
  [What a session can fetch](allow-retrieval.md)).
- The session adds them before the request goes down the stack, so every
  layer sees them. The HTTP cache respects a `Vary` on them and sends them
  when it revalidates.
- Each redirect is a new request (see [Redirects](redirects.md)), and it
  gets the headers for the URL it leads to, not the ones the URL before it
  got. A token for one path doesn't follow a redirect to another path on
  the same origin. In a browser, which follows redirects itself, where a
  redirect leads gets none of them (see [Redirects](redirects.md)).

Rejected:

- Headers for every URL beside the keys, for headers that aren't secret,
  like `User-Agent`. It would be the short way, so it's where a credential
  would go. A header for every request is a layer of the application's, or
  the request's own.
- One function of every URL, `(url: URL) => HeadersInit | undefined`. For
  one token for one API most of it would be the origin check, which is the
  part that's easy to get wrong. A predicate beside the keys was rejected
  for the same reason.
- Globs or patterns as keys. Prefixes say an origin or a path. What they
  can't say, like any subdomain, could be `URLPattern` keys when something
  needs it.
- A layer that adds them. The layers above it wouldn't see them, so the
  HTTP cache would have to be below it to respect a `Vary`. And they would
  be the stack's, which sessions share, so sessions with different
  credentials couldn't share a stack. Credentials are about who's fetching,
  like what a session can fetch.
- A list of every header a credential could be in, to drop on a redirect
  to another origin. A list of names misses the ones it doesn't have, like
  `X-API-Key`, so a credential like that goes in the session's `headers`,
  which are worked out again for each URL. The credentials HTTP defines
  are dropped (see [Redirects](redirects.md)).

## Known limitations

- The HTTP cache is shared by the sessions on a stack, and it's private. A
  response fetched with one session's credentials can answer another
  session's request for the same URL, unless it has a `Vary` on them.
  Sessions with different credentials for the same URL need stacks that
  don't share a cache store.
- A request's own headers follow redirects to every URL, but
  `Authorization`, `Cookie`, and `Proxy-Authorization` to another origin
  (see [Redirects](redirects.md)). A credential in another header, like
  `X-API-Key`, follows a redirect anywhere, so a credential that should
  stay with its URL goes in the session's `headers`.
- A request's record has the headers its first step was sent with, the
  session's and credentials too, so a trace or a HAR export has them (see
  [Fetch records](fetch-records.md)).
