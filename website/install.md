# Install

This module is designed for node.js (ES Modules, TypeScript) and browsers. It
should work in Bun and Deno as well, but the test runner doesn't work in these
environments, so this module may be less stable in those environments.

## Node.js

```bash
npm install @hyperjump/browser
```

## Browser

The package uses [subpath imports](https://nodejs.org/api/packages.html#subpath-imports)
to provide browser-compatible implementations of the parts that depend on
Node.js. Bundlers that support the `imports` field (Vite, webpack, esbuild,
Rollup) select them automatically.

In the browser, relative URIs are resolved against the page's URI, and the
`file:` URI scheme is not available.
