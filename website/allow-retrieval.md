# What a session can fetch

Documents refer to other documents by URL, and following a reference fetches
whatever that URL identifies. That's fine when you control the documents. When
you don't, a document could refer to `http://169.254.169.254/` or
`file:///etc/passwd`, and following that reference would make your app fetch
it. That's why a session fetches only the URLs its `allowRetrieval` option
allows:

```typescript
const session = new Hyperjump({
  allowRetrieval: ["./", "https://api.example.com/"]
});
```

## `allowRetrieval`

`allowRetrieval` is a list of URLs. A URL that ends with `/` allows everything
under that URL, and any other URL allows only that exact URL. An origin such as
`https://example.com` allows everything on it with or without the `/` because
it's the URL of the origin's root, `https://example.com/`. An empty list allows
nothing. The session compares URLs after it parses them, so a different case or
a `..` in a path doesn't get around the list.

The session resolves a relative URL in the list against the working directory in
Node.js or the page in a browser. A worker has no page, so use absolute URLs
there.

The default allows what's local to your app. The Node.js default is `["./"]`,
which allows the files in the working directory. The browser default is
`["/"]`, which allows the page's origin. Your own list replaces the default, so
include `"./"` or `"/"` if you still want to allow those.

`allowRetrieval` always allows a `data:` URL, because its content is in the URL,
so the session doesn't fetch anything.

## Refused URLs

Fetching a URL the list doesn't allow is a network error, the `TypeError` that
`fetch` rejects with. The message says how to allow the URL:

```text
Fetching 'https://example.com/other' isn't allowed. Add it to 'allowRetrieval' to allow it.
```

Its `cause.code` is `"ERR_RETRIEVAL_NOT_ALLOWED"`, so your app can tell a refused
URL from one that failed. For more information, see [Errors](errors.md).

A refused request doesn't get the session's [headers](sessions.md#headers), and
a trace shows it as a request that failed. For more information, see
[Tracing](tracing.md).

The session checks a URL before any layer gets the request, so a URL that the
[HTTP cache](http-caching.md) or a layer of your own answers has to be in the
list too. If a layer has a copy of a document from another origin, add that URL
to the list. A document in the session's [registry](registries.md) isn't
fetched, so it doesn't have to be in the list.

## What it protects against

Checking the URL a session fetches isn't enough on its own because there are
other ways to end up somewhere you didn't allow. `allowRetrieval` covers these
too:

- **Redirects.** The session checks where a redirect leads before it follows the
  redirect, so a server can't make the session send a request to a URL you
  didn't allow. In a browser, `fetch` follows redirects itself and sends the
  request before the session can check it. The session then checks the URL that
  the response came from and doesn't use a response from a URL you didn't
  allow. For more information, see [Redirects](redirects.md).
- **Symbolic links.** In Node.js, the session compares `file:` URLs by their
  real paths, so a symbolic link in an allowed directory can't lead outside it.
- **The cache.** A cached response from a URL the session doesn't allow isn't a
  way around the list.

Separately from the list, only a document from a file can refer to a `file:`
URL. For more information, see
[File URLs](file-urls.md#documents-from-the-web).

## What it doesn't protect against

`allowRetrieval` checks URLs, not the addresses they connect to. A host whose
DNS points at an internal address gets through if the list allows its URL, and
so does a host whose DNS changes to one between requests. That matters when
your list allows hosts that you don't control. To keep requests from reaching
internal addresses, do one of these:

- Allow only hosts that you control or trust.
- Run your app on a network that can't reach internal addresses, such as behind
  a firewall that blocks them.
- Give the transport `http:` and `https:` fetchers that check the address each
  request connects to. For more information, see
  [Transports](transports.md#replace-a-scheme).
