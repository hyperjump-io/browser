# Design

`@hyperjump/browser` is a generic client for traversing JRef and other
JRef-compatible media types, built for the unified ecosystem. These
documents record the decisions made so far, and why. The `.d.ts` files in
`src/` are the source of truth for the API. Documentation for users is in
[`website/`](../website/README.md).

## How it's organized

- **[Principles](principles/README.md)**: the rules decisions are made by.
- **[Style](style/README.md)**: how code here is laid out and written.
- **Specs**: [JRef](../src/jref/README.md), the media type.
- **Components**: how each part works, what was decided, and what was
  rejected, with known limitations.
- **[Benchmarks](benchmarks/README.md)**: the measurements behind the
  performance decisions.

## Components

- [`Hyperjump` and sessions](components/sessions.md), and extending them
- [Media types](components/media-types.md)
- [The `file:` scheme](components/file-scheme.md)
- [HTTP cache](components/http-cache.md)
- [Request headers](components/request-headers.md)
- [What can be retrieved](components/allow-retrieval.md)
- [The JSON AST](components/json-ast.md): the error-tolerant parser, nodes,
  and locations
- [Packaging](components/packaging.md): Node.js and browsers
