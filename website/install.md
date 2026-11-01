# Install

```bash
npm install @hyperjump/browser
```

The Hyperjump browser is an ES module with TypeScript types that runs in Node.js
and browsers. It should also work in Bun and Deno. Its tests don't run there, so
it's less proven in those runtimes.

## Browsers

Some parts of the package depend on Node.js, so the package also has browser
versions of those parts. It picks between them with
[subpath imports](https://nodejs.org/api/packages.html#subpath-imports). Any
bundler that supports the `imports` field chooses the right version for you.
Vite, webpack, esbuild, and Rollup all do.

A few things work differently in a browser:

- The package resolves relative URLs against the page's URL.
- `file:` URLs aren't available.
- The package doesn't have its own HTTP cache because the browser already
  caches. For more information, see [HTTP caching](http-caching.md).
- The default [`allowRetrieval`](allow-retrieval.md) allows what's in the
  page's directory.
