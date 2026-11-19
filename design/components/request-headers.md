# Request headers (`src/request-headers.js`)

A session adds headers, like credentials, by the URL each request is for.
Documents can name any URL, so headers for every URL would send a
credential to every origin a document names. Only listed URLs get headers,
so the short way to configure it is the safe way.

- `headers` is `Record<string, HeadersInit | HeadersFunction>`, keyed by
  URL. A key that ends with `/` is for every URL under it, and any other
  only for itself. `https://example.com` parses to `https://example.com/`,
  the whole origin.
- Keys and URLs are compared parsed, without fragments, so case, dot
  segments, and default ports can't get around a key. The rule is a pure
  function shared with `allowRetrieval` (`src/url-entries.js`).
- A relative key is resolved against the context URL when the session is
  created, and one that can't be throws a `TypeError` there.
- Any scheme can be a key. The transport decides what to send.
- Matching keys merge from shortest to longest, so a path can have a token
  of its own under its origin's.
- A value can be an async function of the URL, so a token can be
  refreshed. It's called for each request and redirect step.
- A request's own header isn't replaced.
- A URL `allowRetrieval` refuses gets none, and no function is called for
  it (see [What a session can fetch](allow-retrieval.md)).
- They're added above the stack, so every layer sees them and the HTTP
  cache respects a `Vary` on them.
- Each redirect step gets the headers for its own URL (see
  [Redirects](redirects.md)).

Rejected:

- Headers for every URL beside the keys, for ones like `User-Agent`. It
  would be the short way, so it's where a credential would go. A header for
  every request is a layer of the application's.
- One function of every URL, or a predicate beside the keys. Most of it
  would be the origin check, which is the part that's easy to get wrong.
- Globs or patterns as keys. What prefixes can't say could be `URLPattern`
  keys when something needs it.
- A layer that adds them. Layers above wouldn't see them, and sessions with
  different credentials couldn't share a stack.
- A list of headers a credential could be in, to drop on a redirect to
  another origin. It misses the ones it doesn't name, like `X-API-Key`, so
  a credential like that goes in the session's `headers`, which are worked
  out again for each URL (see [Redirects](redirects.md)).

## Known limitations

- The HTTP cache is private and shared by a stack's sessions, so a response
  fetched with one session's credentials can answer another's, unless it
  has a `Vary` on them. Those sessions need stacks that don't share a store.
- A request's record has the headers its first step was sent with,
  credentials too, so a trace has them (see [HAR export](har.md)).
