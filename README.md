# Hyperjump - Browser

The Hyperjump Browser is a generic client for traversing JSON Reference ([JRef])
and other [JRef]-compatible media types in a way that abstracts the references
without loosing information.

Everything is built to work with the [unified](https://unifiedjs.com/) ecosystem
of libraries and tools. This module defines ASTs for representing JSON and JRef
documents and provides utilities allowing you to parse, transform, and
stringify documents.

## Documentation

The documentation is in [`website/`](website/README.md). Start with
[Install](website/install.md) and [Getting started](website/getting-started.md).
The JRef media type is specified in the
[JRef spec](https://github.com/hyperjump-io/json-reference/blob/main/spec.md).

## Contributing

### Tests

Run the tests

```bash
npm test
```

Run the tests with a continuous test runner

```bash
npm test -- --watch
```

The design docs, principles, and style guide are in
[`design/`](design/README.md).

[JRef]: https://github.com/hyperjump-io/json-reference/blob/main/spec.md
