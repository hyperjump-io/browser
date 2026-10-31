# HTTP caching

`http:` and `https:` responses are cached according to their caching headers
just like a private browser cache does:

- A fresh response is used without making a request.
- A stale response is revalidated if it has an `ETag` or `Last-Modified`
  header. An unchanged document isn't downloaded again.
- Concurrent requests for the same URL share one request.

The HTTP cache is different from the documents a session keeps. A session keeps
every document it retrieves, so reading through a session never shows a change.
The HTTP cache is part of a `Hyperjump`'s HTTP plugin, so every session from
that `Hyperjump` uses the same HTTP cache. When you start a new session to see
changes, the new session only retrieves what has changed. See
[Sessions](browsing.md#sessions).

## Where responses are kept

Where responses are kept by default depends on the environment:

| Environment | Default |
| --- | --- |
| Node.js | In memory for the life of the `Hyperjump` |
| Browsers | No cache of its own because the browser already caches |

The cache belongs to the HTTP plugin, so to keep responses somewhere else you
replace the default HTTP plugin with one configured with a different `cache`:

```typescript
import {
  FileHttpCacheStore,
  Hyperjump,
  HttpUriSchemePlugin
} from "@hyperjump/browser";

// Keep responses on disk, so they outlive the process
const h = new Hyperjump({
  uriSchemePlugins: [new HttpUriSchemePlugin({
    cache: new FileHttpCacheStore("./.cache/hyperjump")
  })]
});
```

A plugin without a `cache` gets the default for its environment, so a plugin
configured to send [headers](http-headers.md) still caches. To turn caching off,
give it `cache: false`.

To keep responses somewhere else, such as Redis, implement `HttpCacheStore`.
Entries are JSON, so they can be stored anywhere. A store defines these async
methods:

| Method | What it does |
| --- | --- |
| `get(url)` | Returns the entry for a request URL, or `undefined` if there isn't one |
| `set(url, entry)` | Stores the entry for a request URL |
| `delete(url)` | Removes the entry for a request URL |

Plugins only share a cache when they're given the same store.

The cache is private, which means a response retrieved with one set of
credentials can be used for a request to the same URL with another set of
credentials. Don't share a cache between plugins that send different
credentials to the same URLs. See [HTTP headers](http-headers.md).
