# Identifiers are URLs

Every identifier is a URL: a reference in a document, a response's URL, a
document's URL, and a node's location. It's held as a string, the `href`
of a `URL`, so the identifiers documents have are the ones requests,
`fetch`, and files use, and nothing converts between kinds.

A URL is what the [URL Standard](https://url.spec.whatwg.org/) defines and
`new URL` parses. A URI or IRI is what RFC 3986 and RFC 3987 define, and
the two names mean the same thing: an IRI. Either kind can locate,
identify, or both, so neither name says which.

- A URL is parsed once, where it comes in, with `URL.parse` or `new URL`,
  and kept as its `href`. Parsing normalizes it, so equivalent URLs, like
  ones written with a different case or dot segments, are the same string,
  and nothing normalizes them again.
- A URL keeps what the URL Standard serializes, so Unicode in a path is
  percent-encoded and a host is in its ASCII form. An identifier doesn't
  read the way a document wrote it, which doesn't matter for what it's for.
- Every document has a URL, so a reference is always resolved, against its
  document's URL, with `URL.parse`. One that doesn't parse is a syntax
  error, because parsing never fails (see
  [Parsing never fails](parsing-never-fails.md)). A node's location is its
  document's URL with a fragment.
- A URL with an opaque path, like a `urn:`, is only a base for a fragment.
  The URL Standard doesn't resolve any other relative reference against it,
  not even `""`, which RFC 3986 resolves to the base. So in a JRef document
  whose URL is a URN, a reference that isn't `#…` doesn't parse, which is a
  syntax error.

Where a value comes from decides whether it's checked:

- A value from outside is a `string`, and it's parsed once, where it comes
  in: the document URL given to `fromJson` and `fromJref`, and a reference
  in a document. A document URL that isn't a URL throws the `TypeError`
  `new URL` throws, and a reference is a syntax error.
- A value that's handed out is an `href`, and isn't parsed again: a
  document's `url`, and a node's `location` and `href`.

Rejected:

- IRIs (`@hyperjump/uri`). Requests, `fetch`, files, and the working
  directory all use URLs, so every place an identifier went in or came out
  would convert it, and a round trip wouldn't give back the IRI it started
  from.
- `URL` objects in the AST and the API. A node is plain data, and a `URL`
  is mutable and compares by identity, so a node's location couldn't be
  compared with `===` or copied as JSON.
- Documents without a URL, from `fromJson` and `fromJref`. Their locations
  would be only fragments and their relative references couldn't be
  checked, since `URL.parse` needs a base, so they'd be the one place an
  identifier isn't a URL.
