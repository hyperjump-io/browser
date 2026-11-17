# Registries

A registry has documents your app already has, like a copy of a document
bundled with it. A session answers them from the registry instead of
fetching them:

```typescript
import { Hyperjump, browse, registry } from "@hyperjump/browser";

const session = new Hyperjump({
  registry: registry({
    "https://example.com/person.json": {
      body: `{ "name": "Jason" }`,
      headers: { "content-type": "application/json" }
    }
  })
});

const name = await browse(session, "https://example.com/person.json#/name");
```

The session asks the registry before it checks
[`allowRetrieval`](allow-retrieval.md), so `allowRetrieval` doesn't have to
allow a URL that the registry has, and the session doesn't fetch it. The
session fetches a URL that the registry doesn't have as usual, if
`allowRetrieval` allows it.

## Entries

`registry(entries, options)` takes an object of entries by URL. An iterable
of `[url, entry]` pairs such as a `Map` works too. An entry can be:

- A body: a string, a `Uint8Array`, an `ArrayBuffer`, or a `Blob`.
- The parts of a response: `{ body, status, statusText, headers }`.
- A function that makes a response, which the session calls each time it
  asks for the URL: `(url, { session }) => Response`. It has to make a new
  response each time, because you can read a body only once.

A response for a URL that isn't a `file:` URL needs a `Content-Type`, so
a [media type](media-types.md) can parse it.

`registry` copies the entries, so changing them later doesn't change the
registry.

| Option | Description |
| --- | --- |
| `base` | The URL that a relative entry URL resolves against. The default is the working directory in Node.js and the page in a browser. |

## Your own registry

A registry is any object with a `get` method. The session calls it with
the URL, without its fragment, and `{ session }`. It returns a response,
or `undefined` for a URL it doesn't have. It can throw, to say that the URL
is the registry's but the session can't use it:

```typescript
import { Hyperjump, type Registry } from "@hyperjump/browser";

const bundled = {
  get: (url) => url.startsWith("https://example.com/bundled/")
    ? new Response(readBundled(url), {
      headers: { "content-type": "application/json" }
    })
    : undefined
} satisfies Registry;

const session = new Hyperjump({ registry: bundled });
```

The session asks the registry only for `GET` and `HEAD` requests. When a
redirect leads to a URL that the registry has, the session fetches it instead
of asking the registry.

## Tracing

A document from the registry is in a [trace](tracing.md), with
`"registry"` as its source.
