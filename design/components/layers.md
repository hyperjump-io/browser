# Layers

Retrieval is a stack of layers, like the web's layered system. Each layer
sees only the request it's given and the response it gives back, so
caching, security checks, and the rest stack without knowing about each
other, and an application adds its own the same way.

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
| A subclass's | whatever they're for, in the order they're added | session |
| `allowRetrieval` | answers 403 for a URL that isn't allowed, and checks the response's URL too | session |
| `file:` from `file:` | answers 403 for a `file:` URL whose `Referer` isn't a `file:` URL | session |
| Media type by extension | gives a response without a `Content-Type` the media type of its URL's extension | `Hyperjump` |
| Request headers | adds the headers configured for a URL | `Hyperjump` |
| `Accept` | sets `Accept` from the media type plugins | `Hyperjump` |
| HTTP cache | answers fresh responses, revalidates stale ones, and stores responses by their caching headers | `Hyperjump` |
| URL schemes | answers with the plugin for the URL's scheme | `Hyperjump` |

Each session builds its whole stack from what its `Hyperjump` resolved
from its config. A layer with `Hyperjump` scope is one whose state every
session shares, like the HTTP cache's store, so the `Hyperjump` resolves
that state and each session's layer is built over it. Sessions share the
state, not a stack (see [Sessions](sessions.md)).

A layer's place is the order it's added. A layer that's added goes on top
of what's there, so where it goes doesn't need a way to say it. The
session follows redirects itself, above the stack, with a new request for
each URL a redirect leads to (see [Redirects](redirects.md)), so every
layer sees each one.

The built-in layers are in the order that what each has to see decides:

- The HTTP cache is below `allowRetrieval`, so a session can't get a
  response another session was allowed to retrieve.
- `allowRetrieval` checks the response's URL as well as the request's,
  because a symlink, or a redirect `fetch` followed in a browser, can end
  somewhere else.
- Request headers and `Accept` are above the HTTP cache, which needs every
  header a request sends to match a `Vary`.
- The media type by extension is above the HTTP cache, so the cache keeps
  the `Content-Type` the server sent, and changing the option doesn't need
  the cache cleared.

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
the location of the node the reference is in, without its fragment. A
layer that cares, like `file:` from `file:`, reads it.

- A browser drops a `Referer` header from a `Request` a script makes,
  because it's a forbidden request header, and a `Request`'s `referrer`
  falls back to the page for a URL from another origin. So in a browser,
  no layer sees it. `file:` from `file:` doesn't need it there, because a
  browser has no `file:` plugin, and embedded documents are found above
  the stack, from the document a reference is in. An application's layer
  that reads `Referer` only sees it in Node.js.

## Above the stack

The session turns responses into documents and keeps them:

- Its document cache, keyed by URL.
- Embedded documents: a media type plugin can give a document the
  documents it contains, each by the URL the document says it has.
- Parsing, with the media type plugin for the response's `Content-Type`.

## Embedded documents

A media type plugin gives a document the documents it contains, each by
the URL it says it has (`DocumentNode.embedded`), and gives each of them the
same set. A reference is looked for first in the set of the document it's
in, before the document cache or the stack: `get` has that document, and
`getDocument` is given it (`GetOptions.referencedIn`). So an embedded
document is found only from the document that contains it, or from the
others embedded with it. A document can say it contains a document with
any URL, so this keeps it from changing what a reference in another
document finds. It's found above the stack, so it doesn't depend on
`Referer`, which a browser drops.

- It's found by the document, not by a URL, so it doesn't depend on where
  an embedded document's nodes say they are. A plugin can give them
  locations in the document that contains them, or locations that start
  with the embedded document's own URL, like `@hyperjump/json-schema`,
  whose locations are a schema's canonical URIs.
  - Finding it from the document cached at the reference's
    `referencedFrom` was rejected. It needs the nodes of an embedded
    document to have locations in the document that contains it, so a
    reference in one has that document's URL. JSON Schema's output needs
    locations that start with an embedded schema's own URI.
  - Remembering which document each embedded document was found in, by
    its URL, was rejected. A URL that's embedded in two documents, or also
    retrieved by itself, would be ambiguous.
- The URLs a plugin gives come from outside, so the session parses them,
  without the fragment, and one that isn't a URL fails the retrieval (see
  [Identifiers are URLs](../principles/identifiers-are-urls.md)). It keeps
  them parsed itself, so the plugin's `embedded` is as the plugin made it.
  `@hyperjump/json-schema` keys its own by IRI.
- An embedded document is in the media type of the document that contains
  it, unless the plugin gave it its own `mediaType`, so `fragmentPointer`
  works for it.

- An embedded document isn't put in the session's document cache under
  the URL it says it has, so another document's references don't find it.
- It isn't retrieved, so `allowRetrieval` doesn't apply to it, and nothing
  is read from where it says it is. One that says it's a `file:` URL reads
  no file.
- A document has one set of embedded documents. One that's also embedded
  in another document, like a copy in a bundle, is a different document
  there, with that document's set, and has its own when it's found by
  itself, so it never looks in both.
  - Finding an embedded document from any document that contains the one
    making the reference was rejected. A document that embeds a copy of
    another, with a document of its own under a URL the copy refers to,
    would change what the original's references find.
- Whether two documents with the same URL are the same document, like a
  copy in a bundle and the original, is the application's. A media type
  decides what makes them the same.

## Extending

A layer is added on top of the stack, so it answers or changes a request
before the built-in layers do, including `allowRetrieval`. That's what an
application's own documents need: a layer that answers with them, like
`@hyperjump/json-schema`'s registry, answers for URLs that nothing allows,
because nothing is retrieved. A layer that's the application's own code is
trusted like the rest of it.

- A subclass of `Session` adds a layer by overriding `fetch`, the session's
  stack, which everything the session retrieves is requested with:

  ```js
  fetch(request) {
    return registryLayer(this.#registry)((request) => super.fetch(request))(request);
  }
  ```

  It's a method, so a subclass's layer can have the subclass's state, like
  a registry that needs the session.
- `fetch` doesn't follow redirects. A redirect is followed with a new
  request to `fetch`, so a layer sees each URL a redirect leads to, and a
  layer that answers a URL answers it when a redirect leads there too.
  - Following redirects with a layer at the top of the stack was rejected.
    A layer added on top would be above it and only see the first request,
    so a redirect to a URL it answers would go past it. Making it a layer
    that's always on top would make where a layer goes more than the order
    it's added.
- Read-only caches, stores of responses an application has, as part of
  the stack, were rejected. A layer that answers from what it has does
  the same, without a store or an entry format.
- A place for layers below the built-in checks was rejected. Where a layer
  goes would be more than the order it's added.
- A URL scheme plugin's `retrieve` is a `Fetch` for its schemes, and
  doesn't get options for `Accept` or the media type by extension, because
  the layers above give those.
  - `retrieve(url, options)` was rejected. Every layer would be a request
    and options, and an option, like `referencedFrom`, would be a header
    by another name.
- A layer applied to a `Fetch` is a `Fetch`, so what has to be below the
  HTTP cache, like a proxy or logging what goes over the network, wraps a
  URL scheme plugin's `retrieve`:
  `{ schemes: plugin.schemes, retrieve: logged((request) => plugin.retrieve(request)) }`.
  - A place to put layers below the cache was rejected, because wrapping a
    plugin already does it.
- Overriding `getDocument` to find documents somewhere other than the
  cache or a URL scheme plugin was rejected. A layer and embedded documents
  find them in the stack, so a subclass doesn't have to stand between the
  session and everything it retrieves.

## Known limitations

- A `Request` can't be made for a URL with credentials, like
  `foo://user@host/a`, so a URL with a username or password can't be
  retrieved. The constructor throws a `TypeError`, which fails the
  retrieval with it as the cause. `fetch` refuses them too, and a URL
  scheme plugin that needs credentials gets them from its own options,
  like the HTTP plugin's `headers`.
