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
on to `next`. The bottom of the stack is the URI scheme plugins. The top is
the session, which parses responses into documents.

- Requests and responses are the platform's `Request` and `Response`, so a
  layer is written the way any web code is.
- The stack uses URLs. A `Request` holds a WHATWG URL, and every layer
  compares, matches, and caches by URL. Identifiers are IRIs above the
  stack (see [Identifiers are IRIs](../principles/identifiers-are-iris.md)).
  The session converts once in each direction: an IRI to a URL for the
  request, and the response's URL to an IRI with `urlToIri`. That puts the
  URL and IRI boundary where retrieving and identifying meet.
  - A request type that holds an IRI was rejected. Every layer would need
    its own conversion to call anything that takes a URL, like `fetch`,
    and an application's layer couldn't use the platform's types.

## The stack

From the session down:

| Layer | Answers or changes | Scope |
| --- | --- | --- |
| Redirects | follows a 3xx `Location` by sending a new request down the stack | session |
| Read-only caches | answers from stores that are never written | session, then `Hyperjump` |
| `allowRetrieval` | answers 403 for a URL that isn't allowed, and checks the response's URL too | session |
| `file:` from `file:` | answers 403 for a `file:` URL whose `Referer` isn't a `file:` URL | `Hyperjump` |
| Media type by extension | gives a response without a `Content-Type` the media type of its URL's extension | `Hyperjump` |
| Request headers | adds the headers configured for a URL | `Hyperjump` |
| `Accept` | sets `Accept` from the media type plugins | `Hyperjump` |
| HTTP cache | answers fresh responses, revalidates stale ones, and stores responses by their caching headers | `Hyperjump` |
| URI schemes | answers with the plugin for the URL's scheme | `Hyperjump` |

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
501. A layer above sees them like any other response. The session turns
them into its errors, like `RetrievalNotAllowedError`, when it parses.

- A layer throws only when something fails without a response, like a
  network error. The session wraps that in a `RetrievalError`.
- Errors thrown by each layer were rejected. A layer above, like a cache
  of refusals or a fallback, couldn't see them without catching what every
  layer below throws.

## `Referer`

The URL of the document a reference is in is the request's `Referer`
header, the web's way of saying where a request came from. The session
sets it from a reference's document, and a layer that cares, like
`file:` from `file:`, reads it.

## Above the stack

The session turns responses into documents and keeps them:

- Its document cache, keyed by the normalized IRI.
- Embedded documents: a media type plugin can give a document the
  documents it contains, and they're found from that document, like a
  reference from it.
- Parsing, with the media type plugin for the response's `Content-Type`.

## Extending

An application adds layers to a `Hyperjump`'s or a session's stack.
A URI scheme plugin is a `Fetch` for its scheme, and doesn't get options
for `Accept` or the media type by extension, because the layers above
give those.

- Overriding `getDocument` to find documents somewhere other than the
  cache or a URI scheme plugin was rejected. A read-only cache and embedded
  documents find them in the stack, so a subclass doesn't have to stand
  between the session and everything it retrieves.

## Open questions

- How the session tells a refusal from a layer, like `allowRetrieval`'s,
  from a server's 403, to give `RetrievalNotAllowedError` for one and
  `HttpError` for the other.
- Where an application's layers go in the stack, and whether it can put
  one between the built-in ones.
- When an embedded document is found: only from the document that contains
  it, or also from another document that contains the same one.
