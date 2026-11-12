# Browser

The Hyperjump browser is a `fetch` inspired by web browsers. Requests belong to
a session, the way the requests of a page load do. Each request goes through a
stack of layers, such as an HTTP cache, and ends at a transport that retrieves
it by its URL scheme. On a server, that includes `file:` URLs.

## Contents

- [Install](install.md): install in Node.js and browsers
- [Get started](getting-started.md): build a stack and load a page like a browser does
- [Sessions](sessions.md): fetch through a session, close it, and nest sessions
- [What a session can fetch](allow-retrieval.md): allow only the URLs your app should fetch
- [Errors](errors.md): what a failed request rejects with, and how to tell failures apart
- [Layers](layers.md): build a stack and write your own layers
- [File URLs](file-urls.md): fetch `file:` URLs on a server
- [Redirects](redirects.md): how a session follows redirects through the stack
- [HTTP caching](http-caching.md): cache responses by their caching headers
- [Batch requests](batching.md): send requests that go together as one
- [Priorities](priorities.md): connection limits, and what loads first
- [Tracing](tracing.md): see what a session fetched, and why
- [Registry](registry.md): answer requests with documents you already have
- [Resource map](resource-map.md): answer a document's requests with the resources it contains
