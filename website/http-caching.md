# HTTP caching

The `httpCache` layer caches responses according to their caching headers the
way a browser's cache does:

```typescript
import { Hyperjump, compose, httpCache, nodeTransport } from "@hyperjump/browser";

const stack = compose(httpCache())(nodeTransport());
const session = new Hyperjump({ stack, allowRetrieval: ["https://example.com/"] });
```

The cache is for a server. A browser caches responses itself, so in a browser,
`httpCache` throws an error. It caches only `http:` and `https:` URLs, so a
`file:` URL is read every time.

- It uses a fresh response without making a request.
- It revalidates a stale response that has an `ETag` or `Last-Modified`
  header, so an unchanged response isn't downloaded again.
- It serves a stale response while it revalidates in the background when the
  response has `stale-while-revalidate`.
- It keeps a response for each value of the headers a response's `Vary` names.
- A successful `POST`, `PUT`, `PATCH`, or `DELETE` to a URL removes what's
  cached for it.

The cache belongs to the layer, so every session on the same stack shares it,
the way a browser's tabs do.

## Ranges

The cache doesn't answer ranges. A request with a `Range` header bypasses the
cache, and a 206 response isn't cached.

## Cache modes

Like `fetch`, `session.fetch` takes a `cache` option:

| Mode | What the cache does |
| --- | --- |
| `default` | Uses a fresh response, and revalidates a stale one |
| `no-store` | Doesn't use the cache or store the response |
| `reload` | Doesn't use the cache, but stores the response |
| `no-cache` | Always revalidates, even a fresh response |
| `force-cache` | Uses any cached response, however old, and fetches only if there isn't one |
| `only-if-cached` | Uses any cached response, and fails with a network error if there isn't one |

A request with a conditional header such as `If-None-Match` bypasses the cache,
as it does in a browser.

## Responses without a lifetime

The cache can still keep a response that doesn't say how long it's fresh for:

- A 301 or 308 redirect is fresh for a day.
- Another response with a `Last-Modified` header is fresh for a tenth of the
  time since it was last modified.

To choose a lifetime yourself, use the `heuristic` option. It's asked first,
and `undefined` leaves the response to the rules in the previous list:

```typescript
httpCache({
  // Keep 404s for a minute
  heuristic: ({ status }) => status === 404 ? 60 : undefined
});
```

## Options

| Option | Description |
| --- | --- |
| `store` | Where the cache keeps responses. The default is a new `MemoryCacheStore`. |
| `shared` | `true` for a shared cache, like a proxy's, which uses `s-maxage` and doesn't store `private` responses |
| `heuristic` | A lifetime in seconds for a response that doesn't say one |
| `permanentRedirectLifetime` | Seconds that a 301 or 308 without a lifetime is fresh for. The default is a day. `0` turns it off. |
| `heuristicFraction` | The part of the time since `Last-Modified` that a response is fresh for. The default is 0.1. |
| `maxBodySize` | Responses bigger than this many bytes aren't stored |
| `onStoreError` | Called when the store fails. The request still succeeds, as if the cache had nothing. |

## Where the cache keeps responses

`MemoryCacheStore` keeps responses in memory, for up to 1,000 URLs, and forgets
the least recently used first:

```typescript
import { MemoryCacheStore } from "@hyperjump/browser";

httpCache({ store: new MemoryCacheStore({ maxUrls: 5000 }) });
```

On a server, `FileCacheStore` keeps responses on disk, so they outlive the
process:

```typescript
import { FileCacheStore } from "@hyperjump/browser";

httpCache({
  store: new FileCacheStore({ directory: ".cache/http", maxSize: 200 * 1024 * 1024 })
});
```

`FileCacheStore` writes each file under a temporary name and then renames it,
so processes that share the directory never see part of a file. With
`maxSize`, in bytes, it removes the least recently used responses when the cache
grows past it. When several processes write to the same directory, the limit is
only approximate. `FileCacheStore` treats a damaged file as a miss and removes it.
`clear()` removes everything, and `size()` says how many bytes are on disk.

To keep responses somewhere else, such as Redis, implement a `CacheStore`. The
cache does all the HTTP, so a store only keeps entries by URL:

| Method | Description |
| --- | --- |
| `match(url)` | Returns every entry for a URL, one for each variant |
| `put(entry)` | Stores an entry, replacing the one for the same variant |
| `delete(url)` | Removes every entry for a URL |

The methods can be asynchronous. An entry is plain data, so you can store it
anywhere.

## Remove a response

`purge` removes everything cached for a URL:

```typescript
import { findLayer, HttpCache } from "@hyperjump/browser";

await findLayer(stack, HttpCache)?.purge("https://example.com/app.css");
```

## Where a response came from

`responseMeta(response).cache` says what the cache did: `"hit"`, `"miss"`,
`"revalidated"`, `"stale"`, or `"bypass"`.
