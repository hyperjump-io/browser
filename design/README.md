# Design

`@hyperjump/browser` is a `fetch` inspired by web browsers: requests belong
to a session, go through a stack of layers, and end at a transport that
picks a handler by URL scheme. These documents record decisions: what the
code does, why, and what was rejected and why. They don't record history,
such as what the code used to do or when it changed. That's in git. The
`.d.ts` files in `src/` are the source of truth for the API. Documentation
for users is in [`website/`](../website/README.md).

## How it's organized

- **[Principles](principles/README.md)**: the rules decisions are made by.
- **[Style](style/README.md)**: how code here is laid out and written.
- **Components**: how each part works, what was decided, and what was
  rejected, with known limitations.

## Components

- [Response meta](components/response-meta.md): what's known about a response that isn't part of it
- [Priorities](components/priorities.md): signals that can change while a request waits
- [Sessions](components/sessions.md): the requests that belong together, and child sessions
- [Layers](components/layers.md): fetchers that wrap fetchers, and the context
- [Fetch records](components/fetch-records.md): what happened to each request, and observing a session
- [The scheme transport](components/scheme-transport.md): the bottom of a stack
- [The `file:` scheme](components/file-scheme.md): files on a server, like a browser reads them
- [Packaging](components/packaging.md): Node.js and browsers
- [The registry](components/registry.md): documents the application has, answered first
- [HTTP cache](components/http-cache.md): RFC 9111, with the Fetch standard's cache modes
- [Redirects](components/redirects.md): followed one at a time, through the stack
- [Partial content](components/partial-content.md): ranges, and storing 206s
- [The file cache store](components/file-cache-store.md): the HTTP cache on disk
- [The resource map](components/resource-map.md): resources found while loading, for one session
- [Dedupe](components/dedupe.md): requests that are the same, in flight at once, are one
- [Batching](components/batch.md): requests made at about the same time, sent together
- [The scheduler](components/scheduler.md): connection limits and priorities, shared by every session
