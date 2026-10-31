# HTTP caching

`http:` and `https:` responses are cached according to their caching headers
just like a private browser cache does:

- A fresh response is used without making a request.
- A stale response is revalidated if it has an `ETag` or `Last-Modified`
  header. An unchanged document isn't downloaded again.
- Concurrent requests for the same URL share one request.

Every session from the same `Hyperjump` shares the cache, but each `Hyperjump`
has its own. When you start a new session to see changes, it only retrieves what
has changed.

## Where responses are kept

Where responses are kept by default depends on the environment:

| Environment | Default |
| --- | --- |
| Node.js | In memory for the life of the HTTP plugin |
| Browsers | No cache of its own because `fetch` already caches |

The cache belongs to the HTTP plugin, so to keep responses somewhere else you
add an HTTP plugin with a different `cache`. It replaces the default one:

```typescript
import {
  FileHttpCacheStore,
  Hyperjump,
  HttpUriSchemePlugin
} from "@hyperjump/browser";

const h = new Hyperjump();

// Keep responses on disk, so they outlive the process
h.addUriSchemePlugin(new HttpUriSchemePlugin({
  cache: new FileHttpCacheStore("./.cache/hyperjump")
}));
```

A plugin without a `cache` gets the default for its environment, so a plugin
added to send [headers](http-headers.md) still caches. To turn caching off,
give it `cache: false`.

To keep responses somewhere else, such as Redis, implement `HttpCacheStore`.
It's an object with async `get(url)`, `set(url, entry)`, and `delete(url)`
methods. Entries are JSON, so they can be stored anywhere. Plugins only share a
cache when they're given the same store.

The cache is private, which means a response retrieved with one set of
credentials can be used for a request to the same URL with another. Don't share
a cache between plugins that send different credentials to the same URLs. See
[HTTP headers](http-headers.md).
