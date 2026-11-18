# Transports

A transport is the bottom of a stack. It gives each request to the fetcher for
its URL's scheme, the way a browser has a handler for each scheme it supports.
`defaultTransport()` fetches `http:`, `https:`, and `data:` URLs with the
runtime's `fetch`, and works anywhere `fetch` does. On a server,
`nodeTransport()` fetches `file:` URLs too. For more information, see
[File URLs](file-urls.md).

A URL whose scheme the transport doesn't have is a network error whose
`cause.code` is `"ERR_UNKNOWN_URL_SCHEME"`:

```text
The 'tag:' scheme isn't supported, so 'tag:example.com,2026:person' can't be fetched
```

## Add a scheme

Give `defaultTransport` the fetchers for more schemes, by scheme. A scheme has
its colon, the way `URL.protocol` writes it. `fetcher` makes a fetcher from a
function that gets the request and its context, and returns a response:

```typescript
import {
  Hyperjump,
  defaultTransport,
  fetcher,
  browse,
  networkError,
  setResponseMeta
} from "@hyperjump/browser";

const documents: Record<string, string> = {
  "tag:example.com,2026:person": `{ "name": "Luke Skywalker" }`
};

const tags = fetcher((request) => {
  const url = new URL(request.url);
  url.hash = "";
  const body = documents[url.href];
  if (body === undefined) {
    const message = `'${url.href}' doesn't exist`;
    throw networkError(message, undefined, request.url);
  }

  const response = new Response(body, {
    headers: { "content-type": "application/reference+json" }
  });
  return setResponseMeta(response, { source: "memory" });
});

const session = new Hyperjump({
  stack: defaultTransport({ "tag:": tags }),
  allowRetrieval: Object.keys(documents)
});

const name = await browse(session, "tag:example.com,2026:person#/name");
```

A fetcher works the way `fetch` does:

- It ignores the URL's fragment, which isn't part of what's fetched.
- When it can't give a response, it throws a network error, like a browser
  does for a file that doesn't exist. `networkError(message, cause, url)` makes
  one. For more information, see [Errors](errors.md).
- The `Response` constructor can't set a response's URL, so the Hyperjump
  session gives a response without one the request's URL. To give it another,
  like the file that a symbolic link points to, use `withUrl`.
- A response that's a document needs a `Content-Type`, so a
  [media type](media-types.md) can parse it.

`setResponseMeta` says where the response came from, which
`responseMeta(response).source` and a [trace](tracing.md) show. Your fetcher
can also say what it did with `ctx.record.mark(name, detail)`. For more
information, see [Layers](layers.md#the-context).

A session fetches only the URLs its `allowRetrieval` allows, and that includes
a scheme of your own. For more information, see
[What a session can fetch](allow-retrieval.md). A redirect can lead only to
`http:` and `https:` URLs unless the session's `redirectSchemes` includes your
scheme. For more information, see [Redirects](redirects.md).

On a server, `nodeTransport` takes its extra schemes as its `schemes` option:

```typescript
import { nodeTransport } from "@hyperjump/browser";

const transport = nodeTransport({ schemes: { "tag:": tags } });
```

A transport doesn't change after it's made. `with(schemes)` gives you a copy
with more schemes:

```typescript
const transport = defaultTransport().with({ "tag:": tags });
```

Layers go on a transport the same way whatever its schemes are. For more
information, see [Layers](layers.md).

## Replace a scheme

A fetcher for a scheme that the transport already has replaces it, whether you
give it to `defaultTransport`, to `nodeTransport`'s `schemes`, or to `with`.

## Functions

`defaultTransport` and `nodeTransport` make a `SchemeTransport`, which gives
each request to the fetcher for its URL's scheme. `new SchemeTransport(schemes)`
makes one with only the schemes you give it, and its `schemes` property has
them, by scheme.

| Function | Description |
| --- | --- |
| `defaultTransport(extra)` | A transport for `http:`, `https:`, and `data:`, and the schemes in `extra` |
| `nodeTransport(options)` | `defaultTransport` and `file:` URLs, on a server. For more information, see [File URLs](file-urls.md#options). |
| `fileScheme(options)` | The fetcher for `file:` URLs, with the same options as `nodeTransport`'s `file` |
| `networkFetcher` | The fetcher for `http:`, `https:`, and `data:`, with the runtime's `fetch` |
| `fetcher(fn)` | A fetcher from a function of the request and its context |
| `withUrl(response, url)` | The response, with the URL it's for as its `url` |
| `setResponseMeta(response, meta)` | The response, with what's known about it, such as its `source` |
| `networkError(message, cause, url)` | The `TypeError` that a fetcher throws when it can't give a response |
