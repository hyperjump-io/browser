# Install

```bash
npm install @hyperjump/browser
```

It's an ES module, with TypeScript types. It's made for Node.js and
browsers. It should work in Bun and Deno too, but its tests don't run there,
so it's less proven in them.

## Browsers

The package uses
[subpath imports](https://nodejs.org/api/packages.html#subpath-imports) for
browser versions of the parts that use Node.js. Bundlers that support the
`imports` field, like Vite, webpack, esbuild, and Rollup, choose them for
you.

In a browser:

- Relative URIs are resolved against the page's URI.
- `file:` URIs aren't available.
- There's no HTTP cache of its own, because `fetch` already caches (see
  [HTTP caching](http-caching.md)).
- The default [`allowRetrieval`](allow-retrieval.md) allows what's in the
  page's directory.
