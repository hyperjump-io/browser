# Install

```bash
npm install @hyperjump/browser
```

It's an ES module with TypeScript types that runs in Node.js and browsers. It
should also work in Bun and Deno. Its tests don't run there, so it's less proven
in them.

## Browsers

Some parts of the package depend on Node.js, so the package also has browser
versions of those parts. It picks between them with
[subpath imports](https://nodejs.org/api/packages.html#subpath-imports), which
means any bundler that supports the `imports` field chooses the right version
for you. Vite, webpack, esbuild, and Rollup all do.

A few things work differently in a browser:

- Relative URIs are resolved against the page's URI.
- `file:` URIs aren't available.
- The package doesn't have its own HTTP cache because the browser already
  caches. See [HTTP caching](http-caching.md).
- The default [`allowRetrieval`](allow-retrieval.md) allows what's in the
  page's directory.
