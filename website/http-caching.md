# HTTP caching

A session caches `http:` and `https:` responses according to their caching
headers the way a private browser cache does:

- It uses a fresh response without making a request.
- It revalidates a stale response that has an `ETag` or `Last-Modified` header,
  so it doesn't download an unchanged document again.
- Concurrent requests for the same URL share one request.

The HTTP cache is different from the documents a session keeps. A session keeps
every document it retrieves, so reading through a session never shows a change.
The HTTP cache belongs to the `Hyperjump`, so every session from that
`Hyperjump` uses the same HTTP cache. When you start a new session to see
changes, the new session only retrieves what has changed. For more information,
see [Sessions](browsing.md#sessions).

## Where the cache keeps responses

Where the cache keeps responses by default depends on the environment:

| Environment | Default |
| --- | --- |
| Node.js | In memory for the life of the `Hyperjump` |
| Browsers | No cache of its own because the browser already caches |

To keep responses somewhere else, use the `httpCache` config:

```typescript
import { FileHttpCacheStore, Hyperjump } from "@hyperjump/browser";

// Keep responses on disk so they outlive the process
const h = new Hyperjump({
  httpCache: new FileHttpCacheStore("./.cache/hyperjump")
});
```

Without `httpCache`, a `Hyperjump` gets the default for its environment. To turn
caching off, use `httpCache: false`.

To keep responses somewhere else such as Redis, implement `HttpCacheStore`.
Entries are JSON, so you can store them anywhere. A store defines these
asynchronous methods:

| Method | Description |
| --- | --- |
| `get(url)` | Returns the entry for a request URL, or `undefined` if there isn't one |
| `set(url, entry)` | Stores the entry for a request URL |
| `delete(url)` | Removes the entry for a request URL |

Each `Hyperjump` has its own default store, so `Hyperjump`s only share a cache
when you give them the same store.

The cache is private. A response to a request with one set of credentials can
answer a request to the same URL with another set of credentials. Don't share a
store between `Hyperjump`s that send different credentials to the same URLs. For
more information, see [HTTP headers](http-headers.md#caching).
