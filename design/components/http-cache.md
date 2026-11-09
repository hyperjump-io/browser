# HTTP cache (`src/hyperjump/url-schemes/http-scheme-plugin.js`)

- Retrieved responses go in an HTTP cache, according to their caching
  headers. It's under the URL scheme plugins and stores responses, not
  documents, so it doesn't depend on how a response is parsed, and every
  session from a `Hyperjump` shares it.
- It's part of `HttpUrlSchemePlugin` (a `cache` option), because caching
  headers are HTTP's. Changing it is configuring an HTTP plugin in the
  `urlSchemePlugins` config. A `config.http` for the default plugin's
  options was considered and rejected: no other plugin has config of its
  own, and it wouldn't say what the plugin has once the plugin is replaced.
  With plugins in the config, it adds nothing. It uses `http-cache-semantics`, as a private cache. A
  stale response with an `ETag` or `Last-Modified` is revalidated. A 304
  that doesn't match the cached response is retried without revalidating.
- A response that's stale as soon as it's stored and can't be revalidated
  isn't stored, because it would never be used again.
- A redirect is a response like any other, cached by its own URL. The
  plugin returns it and the session follows it (see
  [Redirects](redirects.md)), so a cacheable one, such as a 301 or a 308,
  isn't requested again while it's fresh. In browsers, `fetch` follows
  redirects, so for a plugin that's given a store, the response it ends at
  is cached under the URL that was asked for.
- The store is pluggable (`HttpCacheStore`): `MemoryHttpCacheStore`, the
  default in Node.js, or `FileHttpCacheStore`, which outlives the process.
- A plugin without a `cache` gets the environment's default
  (`#default-http-cache`): a new memory store in Node.js, and none in a
  browser, where `fetch` already respects caching headers. `cache: false`
  doesn't cache. So each plugin, and each `Hyperjump`'s default plugin, has
  its own memory store, and plugins don't share a cache unless they're
  given the same store.
  - Not caching without a `cache`, with a memory store only in the default
    plugins, was rejected, because code for both environments couldn't ask
    for the default.
  - `undefined` is the default, so turning caching off needs another value.
    `false` was chosen over `null` because `cache: false` reads as what it
    does.
  - A memory store in browsers too was rejected. It would cache what
    `fetch` already caches and ignore what the browser knows, such as a
    hard reload.
- With a cache, requests for the same URL and headers at the same time
  share one request. A session's document cache keeps it from retrieving
  the same resource twice.
  - Sharing by URL only would let a plugin in more than one `Hyperjump`,
    whose media types or `headers` config differ, give one the response the
    other asked for, which the cache's `Vary` check would have refused.
  - A plugin can be in more than one `Hyperjump`, like one with an
    application's cache that's also given to a `JsonSchema`.
    Not sharing plugins was considered. Enforcing it would take a
    module-level record of which `Hyperjump` has each plugin, or a config
    of plugin factories instead of plugins, and the plugin's state is
    safe to share once requests are keyed by everything a caller gives it.
- `file:` responses aren't cached, so each new session reads files again.
