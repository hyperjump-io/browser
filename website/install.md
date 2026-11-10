# Install

```bash
npm install @hyperjump/browser
```

The browser is an ES module. It runs in Node.js 20.3 or later and in web
browsers.

## Node.js and browsers

There's one entry point, `@hyperjump/browser`, for both. Some parts only work on
a server, such as `file:` URLs and the cache store that keeps responses on
disk. Bundlers that support the `imports` field of
`package.json` choose the browser version of those parts for you. In a browser,
using one of them throws an error that says it isn't supported there.
