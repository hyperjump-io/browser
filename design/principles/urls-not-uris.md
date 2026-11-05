# URLs, not URIs

Browser is a WHATWG client, so what it identifies is a WHATWG URL. A
reference's `$ref` is resolved with `new URL`, what's retrieved is a URL
without its fragment, and a node's location is a URL that a URL parser
leaves as it is. `fetch`, browsers, and Node.js already agree on what a URL
is, so Browser doesn't need a URI library or rules of its own.

- A reference is resolved the way a browser resolves a link. It's
  percent-encoded where a URL requires it, so a `$ref` with non-ASCII
  characters resolves to its encoded form. A host is lowercased, and a
  special scheme's host is converted to ASCII.
- Applications that identify documents by URIs that aren't URLs handle
  that themselves.

Rejected:

- Resolving references by RFC 3986 with `@hyperjump/uri`. It resolves a
  relative reference against any scheme and keeps IRIs as they are. But
  retrieval uses URLs, so a session would have two ideas of what an
  identifier is. A reference resolved by one and retrieved by the other
  can be a different resource, as with a `%2e%2e` segment, which a URL
  treats as `..` and RFC 3986 doesn't. It's also a dependency for what the
  platform already does.

Known limitations:

- A relative reference can't be resolved against a URL with an opaque path,
  like `urn:example:a`. Only a fragment can. Parsing a document with one
  throws.
