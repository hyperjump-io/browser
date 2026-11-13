# Design

`@hyperjump/browser` is a hypermedia browser. It retrieves documents the
way a web browser does: requests belong to a session, go through a stack of
layers, and end at a transport that picks a handler by URL scheme. The
stack is how it retrieves, and a retrieval feature is here only if it
serves loading documents. These documents record decisions: what the
code does, why, and what was rejected and why. They don't record history,
such as what the code used to do or when it changed. That's in git. The
`.d.ts` files in `src/` are the source of truth for the API. Documentation
for users is in [`website/`](../website/README.md).

## How it's organized

- **[Principles](principles/README.md)**: the rules decisions are made by.
- **[Style](style/README.md)**: how code here is laid out and written.
- **Components**: how each part works, what was decided, and what was
  rejected, with known limitations.
- **[Benchmarks](benchmarks/README.md)**: the measurements behind
  performance decisions.

## Components

- [Response meta](components/response-meta.md): what's known about a response that isn't part of it
- [Priorities](components/priorities.md): signals that can change while a request waits
- [Sessions](components/sessions.md): the requests that belong together
- [Layers](components/layers.md): fetchers that wrap fetchers, and the context
- [Fetch records](components/fetch-records.md): what happened to each request, and observing a session
- [Network errors](components/network-errors.md): messages for people, and `cause.code` for code
- [Errors with codes](components/coded-errors.md): every other failure says why the same way
- [The scheme transport](components/scheme-transport.md): the bottom of a stack
- [The `file:` scheme](components/file-scheme.md): files on a server, like a browser reads them
- [Packaging](components/packaging.md): Node.js and browsers
- [HTTP cache](components/http-cache.md): RFC 9111, with the Fetch standard's cache modes
- [Request headers](components/request-headers.md): headers by URL, so a credential goes only where it's for
- [What a session can fetch](components/allow-retrieval.md): `allowRetrieval`, so a document can't make a session fetch whatever it names
- [`file:` from `file:`](components/file-references.md): only a file can refer to a file, so a document from the web can't read them
- [Redirects](components/redirects.md): followed by the session one at a time, through the stack
- [The file cache store](components/file-cache-store.md): the HTTP cache on disk
- [The scheduler](components/scheduler.md): connection limits and priorities, shared by every session
- [The throttle](components/throttle.md): a page's low-priority requests wait for its important ones
- [Tracing](components/tracing.md): what a session fetched, as a waterfall
- [HAR export](components/har.md): traces that open in browser devtools
- [The JSON AST](components/json-ast.md): parsing JSON and JRef to trees with positions, and never failing
- [Documents](components/documents.md): `get` and `documentOf`, the documents a session keeps, and following references
- [Browsing](components/browsing.md): the `jref*` functions, which read nodes and follow references
- [Media types](components/media-types.md): plugins that parse a response into a document, and how one is chosen
- [Local paths in errors](components/file-urls.md): a `file:` URL in a message is relative to the working directory
