# Hyperjump - Browser

A `fetch` inspired by web browsers. Requests belong to a session, the way a
page load's requests do. They go through a stack of layers, like an HTTP
cache and a scheduler, and end at a transport that picks a handler by URL
scheme, including `file:` on the server.

```typescript
import { Session, compose, dedupe, httpCache, nodeTransport } from "@hyperjump/browser";

const stack = compose(dedupe(), httpCache())(nodeTransport());
const session = new Session(stack, { baseURL: "https://example.com/docs/" });

const response = await session.fetch("index.html");
```

- **Layers you compose.** Each layer wraps the one below it, so you build
  the stack you need, and add your own the same way.
- **HTTP done properly.** An RFC 9111 cache with revalidation, `Vary`,
  `stale-while-revalidate`, and partial content, in memory or on disk.
- **Sessions like page loads.** Closing a session cancels what it started,
  and child sessions work like iframes.
- **Node.js and browsers.** It runs on the server and in web browsers.

## Install

```bash
npm install @hyperjump/browser
```

This branch is version 2, which isn't released yet.

## Documentation

The documentation is in [`website/`](website/README.md).

## Contributing

The design docs, principles, and style guide are in
[`design/`](design/README.md). Read the documents about the part you're working
on before you change it.

```bash
npm test               # Run the tests
npm test -- --watch    # Run the tests when files change
npm run lint
npm run type-check
```

The docs are checked with [Vale](https://vale.sh/). Run `vale sync` once to
download the styles, then run `vale website design`.
