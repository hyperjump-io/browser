# `file:` from `file:` (`src/file-references.js`)

A document from the web shouldn't read the application's files.
`allowRetrieval` limits files to the working directory, but a document from
anywhere could still refer to one there and get it into results or errors.
So only a `file:` document can refer to a `file:` URL.

- The document a request comes from is its initiator's response's URL,
  after redirects, or the URL it asked for if there's no response yet.
- A request without an initiator is the application's own, like a URL from
  the command line, so it can fetch a `file:` URL.
- A document without a record, like a tree from a unified pipeline, is
  given as the request's `referrer`, the URL the application says it has.
  `referrer` wins over the initiator.
- The session works it out once, when the request starts, as
  `record.referrer` (`referrerFor`). It keeps `referrer` from the runtime,
  which would replace one from another origin with `about:client`.
- It's checked everywhere `allowRetrieval` is (see
  [Where it's checked](allow-retrieval.md#where-its-checked)), and first,
  since adding the URL to `allowRetrieval` wouldn't help. It's checked
  before the registry is asked, and on a registry response whose URL is
  another one. So a layer that answers a URL like `urn:` with a file can't
  take a document from the web to one. A redirect can't lead to a file at
  all (see [Redirects](redirects.md)).
- A document the session has is checked before it's given, by the URL
  asked for and its response's URL (see [Documents](documents.md)).
  Otherwise what a document from the web got would depend on what was
  browsed first.
- A refusal is a network error, recorded without the session's headers
  (see [Errors](errors.md)).
- There's no option to turn it off. A document whose file references are
  meant to be followed is a file.
- A `data:` document isn't a file. Its content could be from anywhere.

## Absolute `file:` URLs

A document that names a file by an absolute `file:` URL says where files
are on a machine and only works there.

- A JRef `$ref` that's an absolute `file:` URL is a syntax error (see
  [The JSON AST](json-ast.md)).
- A document that isn't a file and says it contains a `file:` document, or
  that its own URL is one, is an `ERR_ABSOLUTE_FILE_URL` (see
  [Documents](documents.md)). Whether it's a file is by its response's URL,
  not the `url` it says it has. A file can contain files, because a
  resolved URL can't be told from a relative one.
  - Judging by the document's own `url` was rejected. A document from the
    web would say it's a file.

## Embedded documents

A request an embedded document causes has its container's record as its
initiator, so it's judged by where it was found, not the URL it says it
has.

Rejected:

- Judging an embedded document by its own URL. A document from the web
  would say it contains a `file:` document.
- A layer. The stack is shared, and the HTTP cache would answer before it.
- Refusing a `file:` URL without an initiator. That's how the application
  reads its files.
- Checking a document without a record in `browse`, before it fetches. It
  wouldn't see redirects or a layer that answers with a file.
- A made-up record for a document the session didn't retrieve. A trace
  would show a request that wasn't made.
- Treating a document without a record as the application's. Its content
  could be from anywhere, like stdin.

## Known limitations

- A document being retrieved is shared by whoever asks, and retrieved for
  the first. If it's refused for that one, the others get the refusal too.
  They can ask again.
- It's only as good as the initiators callers give. One that's left out
  makes the request the application's.
- A `Response` from outside a session has no record, so it's no initiator.
- A parser that takes a document's URL from its content makes a document
  from the web a file if it says it is one.
