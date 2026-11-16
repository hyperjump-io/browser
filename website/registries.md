# Registries

A registry has documents your app already has, like a copy of a document
bundled with it. A session answers them from the registry instead of
fetching them:

```typescript
import { Hyperjump, get, registry } from "@hyperjump/browser";

const session = new Hyperjump({
  registry: registry({
    "https://example.com/person.json": {
      body: `{ "name": "Jason" }`,
      headers: { "content-type": "application/json" }
    }
  })
});

const name = await get(session, "https://example.com/person.json#/name");
```

The session asks the registry before it checks
[`allowRetrieval`](allow-retrieval.md), so a URL the registry has doesn't
have to be allowed. Nothing is fetched for it. A URL the registry doesn't
have is fetched as usual, if it's allowed.

## Entries

`registry` takes entries by URL. A relative URL is resolved against the
`base` option, or the working directory in Node.js or the page in a
browser. An entry can be:

- A body: a string, a `Uint8Array`, an `ArrayBuffer`, or a `Blob`.
- The parts of a response: `{ body, status, statusText, headers }`.
- A function that makes a response, which is called each time the URL is
  asked for: `(url, { session }) => Response`. It has to make a new
  response each time, because a body can only be read once.

A response for a URL that isn't a `file:` URL needs a `Content-Type`, so
a [media type](media-types.md) can parse it.

The entries are copied, so changing them later doesn't change the registry.

## Your own registry

A registry is any object with a `get` method. The session calls it with
the URL, without its fragment, and `{ session }`. It returns a response,
or `undefined` for a URL it doesn't have. It can throw, to say the URL is
the registry's but can't be used:

```typescript
const bundled = {
  get: (url) => url.startsWith("https://example.com/bundled/")
    ? new Response(readBundled(url), { headers: { "content-type": "application/json" } })
    : undefined
};

const session = new Hyperjump({ registry: bundled });
```

Only `GET` and `HEAD` requests are asked. A redirect to a URL the registry
has is fetched.

## Tracing

A document from the registry is in a [trace](tracing.md), with
`"registry"` as its source.
