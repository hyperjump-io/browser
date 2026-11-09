# Layers

Retrieval is a stack of layers, like the web's layered system. Each layer
sees only the request it's given and the response it gives back, so
caching, security checks, and the rest stack without knowing about each
other, and an application adds its own the same way.

This is the design being built (see `TODO.md`). The documents for the
parts it changes describe the code as it is until each part is built.

## The layer

```ts
type Fetch = (request: Request) => Promise<Response>;
type Layer = (next: Fetch) => Fetch;
```

A layer answers a request itself, like a cache hit or a refusal, changes
the request or the response, like adding a header, or passes the request
on to `next`. The bottom of the stack is the URL scheme plugins. The top is
the session, which parses responses into documents.

- Requests and responses are the platform's `Request` and `Response`, so a
  layer is written the way any web code is.
- A `Request` holds a URL, and every layer compares, matches, and caches by
  URL, like everything else in Browser (see
  [Identifiers are URLs](../principles/identifiers-are-urls.md)), so
  nothing converts between the stack and the session.

## The stack

From the session down:

| Layer | Answers or changes | Scope |
| --- | --- | --- |
| Redirects | follows a 3xx `Location` by sending a new request down the stack | session |
| Read-only caches | answers from stores that are never written | session, then `Hyperjump` |
| `allowRetrieval` | answers 403 for a URL that isn't allowed, and checks the response's URL too | session |
| `file:` from `file:` | answers 403 for a `file:` URL whose `Referer` isn't a `file:` URL | `Hyperjump` |
| The application's | whatever they're for, in the order they're given | `Hyperjump` |
| Media type by extension | gives a response without a `Content-Type` the media type of its URL's extension | `Hyperjump` |
| Request headers | adds the headers configured for a URL | `Hyperjump` |
| `Accept` | sets `Accept` from the media type plugins | `Hyperjump` |
| HTTP cache | answers fresh responses, revalidates stale ones, and stores responses by their caching headers | `Hyperjump` |
| URL schemes | answers with the plugin for the URL's scheme | `Hyperjump` |

A session's layers wrap its `Hyperjump`'s, so each session has its own
stack in front of shared state, like the HTTP cache.

Where a layer goes is decided by what it has to see:

- Redirects are above `allowRetrieval`, so each URL a redirect leads to is
  checked like the first. A redirect gets its own request headers too.
- Read-only caches are above `allowRetrieval`, because nothing is
  retrieved from them. The HTTP cache is below it, so a session can't get
  a response another session was allowed to retrieve.
- `allowRetrieval` checks the response's URL as well as the request's,
  because a symlink, or a redirect `fetch` followed in a browser, can end
  somewhere else.
- Request headers and `Accept` are above the HTTP cache, which needs every
  header a request sends to match a `Vary`.
- The media type by extension is above the HTTP cache, so the cache keeps
  the `Content-Type` the server sent, and changing the option doesn't need
  the cache cleared.

## Read-only caches

A read-only cache is a store of responses that's never written. It's for
documents an application has that aren't retrieved, like files it has
read or documents it was given.

- A store only needs `get(url)`. Being read-only is how the stack uses a
  store, not a kind of store, so one an application builds by writing to
  a memory or a file store is used read-only after.
- Its responses are always fresh, so they're never revalidated, which is
  why the layer never writes.
- Its entries are a URL, headers, and a body, with no cache policy.
  - One entry format with the HTTP cache's was rejected. Every entry would
    need a policy made up to say it never expires.
- A session's read-only caches come before its `Hyperjump`'s, and a
  read-only cache comes before the HTTP cache, so a document an
  application has wins over one that was retrieved before.

## Errors are responses

What happens to a request is a response, as it is on the web: a refusal is
a 403, a file that isn't there is a 404, and a scheme without a plugin is a
501. A layer above sees them like any other response.

- A layer that answers with an error explains it in the body, as Problem
  Details (RFC 9457, `application/problem+json`), with the explanation in
  `detail`. A server that sends Problem Details is explained the same way.
- The session gives an `HttpError` for any response it can't parse, with
  the status and, if there is one, the `detail` in its message. The
  `detail` comes from outside, so it's cut to a few hundred characters and
  its control characters are removed. A refusal, a missing file, and a
  scheme without a plugin are `HttpError`s with their status, like a
  server's.
  - Telling a layer's refusal from a server's 403, to keep a
    `RetrievalNotAllowedError`, was rejected. On the web, a client doesn't
    know whether a proxy or the server refused, and what the distinction
    was for, a message that says which `allowRetrieval` to change, is in
    the `detail`. Marking a layer's responses with a header that the bottom
    of the stack strips from servers' was rejected as machinery for one
    message, and a `Response` subclass because a layer that makes a new
    response loses it.
  - The explanation in `statusText` was rejected. It's the reason phrase,
    "Forbidden" for a 403, and HTTP/2 doesn't send one. A header was
    rejected because there's no standard one: `Warning` is obsolete
    (RFC 9111).
- A layer throws only when something fails without a response, like a
  network error. The session wraps that in a `RetrievalError`.
- Errors thrown by each layer were rejected. A layer above, like a cache
  of refusals or a fallback, couldn't see them without catching what every
  layer below throws.

## `Referer`

A request for a reference has a `Referer` header: the URL of the document
the reference was found in, which is what `Referer` means on the web. It's
the document's URL, not the location of the node the reference is in,
which a media type can make the URL of something else, like an embedded
document's. A layer that cares, like `file:` from `file:`, reads it.

- A browser drops a `Referer` header from a `Request` a script makes,
  because it's a forbidden request header, and a `Request`'s `referrer`
  falls back to the page for a URL from another origin. So in a browser,
  no layer sees it. `file:` from `file:` doesn't need it there, because a
  browser has no `file:` plugin, and embedded documents are found above
  the stack, from the session's `referencedFrom`. An application's layer
  that reads `Referer` only sees it in Node.js.

## Above the stack

The session turns responses into documents and keeps them:

- Its document cache, keyed by URL.
- Embedded documents: a media type plugin can give a document the
  documents it contains, each by the URL the document says it has.
- Parsing, with the media type plugin for the response's `Content-Type`.

## Embedded documents

An embedded document is found only from the document that contains it:
the `referencedFrom` the session has for the reference. A document can say
it contains a document with any URL, so this keeps it from changing what a
reference in another document finds. It's found above the stack, so it
doesn't depend on `Referer`, which a browser drops.

- An embedded document isn't put in the session's document cache under
  the URL it says it has, so another document's references don't find it.
- It isn't retrieved, so `allowRetrieval` doesn't apply to it, and nothing
  is read from where it says it is. One that says it's a `file:` URL reads
  no file.
- A document has one set of embedded documents. One that's also embedded
  in another document, like a copy in a bundle, has that document's set
  when it's found from there and its own when it's found by itself, so it
  never looks in both.
  - Finding an embedded document from any document that contains the one
    making the reference was rejected. A document that embeds a copy of
    another, with a document of its own under a URL the copy refers to,
    would change what the original's references find.
- Whether two documents with the same URL are the same document, like a
  copy in a bundle and the original, is the application's. A media type
  decides what makes them the same.

## Extending

An application adds layers with the `layers` config of its `Hyperjump`.
They're below redirects, so they see each URL a redirect leads to, and
below the built-in checks, `allowRetrieval` and `file:` from `file:`. They're
above request headers, `Accept`, the media type by extension, and the HTTP
cache, so a cached response goes through them, and a header they add is
part of what the cache matches a `Vary` against. A read-only cache answers
before them, so a document the application has doesn't go through them.

- A URL scheme plugin is a `Fetch` for its scheme, and doesn't get options
  for `Accept` or the media type by extension, because the layers above
  give those.
- A layer applied to a `Fetch` is a `Fetch`, so what has to be below the
  HTTP cache, like a proxy or logging what goes over the network, wraps a
  URL scheme plugin: `urlSchemePlugins: [logged(httpPlugin)]`.
  - A place to put layers below the cache was rejected, because wrapping a
    plugin already does it.
- A session doesn't take layers of its own. Its stack has its read-only
  caches and `allowRetrieval`.

- Overriding `getDocument` to find documents somewhere other than the
  cache or a URL scheme plugin was rejected. A read-only cache and embedded
  documents find them in the stack, so a subclass doesn't have to stand
  between the session and everything it retrieves.

## Known limitations

- A `Request` can't be made for a URL with credentials, like
  `foo://user@host/a`, so a URL with a username or password can't be
  retrieved. The constructor throws a `TypeError`, which fails the
  retrieval with it as the cause. `fetch` refuses them too, and a URL
  scheme plugin that needs credentials gets them from its own options,
  like the HTTP plugin's `headers`.
