# Install

```bash
npm install @hyperjump/browser
```

The browser is an ES module. It needs Node.js 24 or later. In a web browser, it
needs Chrome 126 or later, Edge 126 or later, Firefox 131 or later, or Safari
18.4 or later. In an older one, importing it throws an error.

## Node.js and browsers

There's one entry point, `@hyperjump/browser`, for both. Some parts only work on
a server, such as `file:` URLs and the cache store that keeps responses on
disk. Bundlers that support the `imports` field of
`package.json` choose the browser version of those parts for you. In a browser,
using one of them throws an error that says it isn't supported there.
