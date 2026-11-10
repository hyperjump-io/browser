# Identifiers are URLs

Every identifier the session and its plugins work with is a URL: what an
application passes to `get`, a reference in a document, a response's URL,
a document's URL, a node's location, and the keys of the cache. It's held
as a string, the `href` of a `URL`, so the identifiers Browser works with
are the ones requests, `fetch`, and files use, and nothing converts between
kinds.

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
- What a scheme's URLs mean, and whether they can be retrieved, is its URL
  scheme plugin's. A `urn:` is parsed like any other.
- A URL with an opaque path, like a `urn:`, is only a base for a fragment.
  The URL Standard doesn't resolve any other relative reference against it,
  not even `""`, which RFC 3986 resolves to the base. So in a JRef document
  whose URL is a URN, a reference that isn't `#…` doesn't parse, which is a
  syntax error. A media type plugin that resolves its references itself,
  like `@hyperjump/json-schema`'s, which resolves them as IRIs, gives
  Browser absolute URLs, so this doesn't apply to it.
- An application that needs IRIs, like a JSON Schema registry, converts
  where it meets Browser, in front of the stack. An IRI that isn't a URL
  can't be requested, so it's found there or not at all.

Where a value comes from decides whether it's checked:

- A value from outside Browser is a `string`, and it's parsed once, where
  it comes in: what's given to `get` and `getDocument`, `referencedFrom`,
  the document URL given to `fromJson` and `fromJref`, a reference in a
  document, and a redirect's `Location`. One that isn't a URL throws the
  `TypeError` `new URL` throws. A `Location` fails the retrieval, with the
  error as its cause, and a reference is a syntax error.
- A value Browser hands out is an `href`, and isn't parsed again: a
  document's `uri`, a node's `location` and `href`, a response's `url` for
  a media type plugin, and an error's `uri`.

Rejected:

- IRIs (`@hyperjump/uri`). Requests, `fetch`, files, and the working
  directory all use URLs, so every place an identifier went in or came out
  converted it, and a round trip didn't give back the IRI it started from.
  An application that needs IRIs, like a JSON Schema registry, is one
  place, and converting there costs less than converting everywhere else.
- `URL` objects in the AST and the API. A node is plain data, and a `URL`
  is mutable and compares by identity, so a node's location couldn't be
  compared with `===` or copied as JSON.
- Documents without a URL, from `fromJson` and `fromJref`. Their locations
  would be only fragments and their relative references couldn't be
  checked, since `URL.parse` needs a base, so they'd be the one place an
  identifier isn't a URL.
