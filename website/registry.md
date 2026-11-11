# Registry

A registry answers requests with documents you already have, so they're never
fetched. Use it for a copy of a document that's bundled with your app,
for test fixtures, or to work offline:

```typescript
import { Session, compose, registry, defaultTransport } from "@hyperjump/browser";

const stack = compose(
  registry({
    base: "https://example.com/",
    entries: {
      "schemas/person.json": personSchema,
      "old-page": { status: 410, body: "This page is gone" }
    }
  })
)(defaultTransport());

const session = new Session(stack, { baseURL: "https://example.com/" });
await session.fetch("https://example.com/schemas/person.json"); // from the registry
```

The registry answers `GET` and `HEAD` requests for the URLs it has, and passes
every other request to the layer below it. A session checks a URL before the
registry answers it, so the session's `allowRetrieval` has to allow the URL.
For more information, see [What a session can fetch](allow-retrieval.md). It never adds what it passes on, so
what it has doesn't change.

## Entries

An entry can be one of these:

| Entry | Response |
| --- | --- |
| A string, `Uint8Array`, `ArrayBuffer`, or `Blob` | A 200 with that body |
| `{ body, status, statusText, headers }` | A response with those parts |
| A function of the request | The response it returns, which has to be a new one each time |

A response without a `Content-Type` gets the type for its URL's extension.

## Options

| Option | Description |
| --- | --- |
| `entries` | Documents by URL, as an object or as a list of `[url, entry]` pairs |
| `base` | The URL to resolve relative URLs in `entries` against |
| `resolve` | A function that answers a URL that isn't in `entries`. Return `undefined` to pass the request on. |
| `onMiss` | `"next"` to pass on a URL the registry doesn't have, which is the default, or `"error"` to fail it |

With `onMiss: "error"`, a session can only fetch what's in the registry. That's
useful in tests, where nothing should reach the network.

## Look in a registry

`has` says whether a URL is in `entries`, and `urls` lists them:

```typescript
import { findLayer, Registry } from "@hyperjump/browser";

findLayer(stack, Registry)?.has("https://example.com/schemas/person.json"); // true
```
