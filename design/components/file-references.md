# `file:` from `file:` (`src/file-references.js`)

A document from the web shouldn't be able to read the application's files.
`allowRetrieval` limits files to the working directory by default, but a
document from anywhere could still refer to one in it and get what it says
into results or errors. So only a `file:` document can refer to a `file:`
URL.

- The document a request comes from is its initiator, and its URL is the
  initiator's response's URL (`finalUrl`), after redirects. An initiator
  without a response yet is the URL it asked for.
- A request without an initiator is the application's own, like a URL it's
  given on the command line, so it can fetch a `file:` URL.
- A document without a record, like one the session didn't retrieve, is
  given by its URL, as the request's `referrer`. A tree from a unified
  pipeline has the URL the application gave it, its file's path or the
  `url` option, so it's judged by where the application says it is, like
  a document that was retrieved. `referrer` wins over the initiator.
- The session works out the referrer once, when the request starts, and
  keeps it on the record (`record.referrer`), where every check of the
  request reads it.
- The session keeps `referrer` from the runtime, the way it keeps `cache`
  and `priority`. A browser replaces a `referrer` from another origin with
  `about:client`, and a `Request` that's copied with options loses it.
- The session checks it with `allowRetrieval`, everywhere `allowRetrieval`
  is checked (see [What a session can fetch](allow-retrieval.md)): the URL
  that's asked for, before its headers are found, where each redirect
  leads, and a response's URL that isn't the one asked for. So a layer
  that answers a URL like `urn:` with a file can't take a document from
  the web to a file. A redirect can't lead to a file at all (see
  [Redirects](redirects.md)).
  It's checked first, because adding the URL to `allowRetrieval` wouldn't
  help, and before the registry is asked, whose answers `allowRetrieval`
  doesn't apply to (see [The registry](registry.md)). A registry's
  response whose URL is another one is checked too.
- A document the session has isn't fetched again, so it's checked before
  it's given, by the URL that's asked for and the URL its response came
  from (see [Documents](documents.md)). Otherwise a document from the web
  could refer to a file the application browsed, and what it got would
  depend on what was browsed first. The rule for which document a request
  comes from is one function (`referrerFor`), for both.
- A refused reference is a network error, like a URL `allowRetrieval`
  refuses, and it's recorded the same way, without the session's headers.
  Its message names the URL and the document, and says only a `file:`
  document can refer to a `file:` URL.
- It's for every session, with no option to turn it off. A document whose
  references to files are meant to be followed is a file.
- A `data:` document isn't a file, so it can't refer to one. Its content
  could have come from anywhere.

## Absolute `file:` URLs

A document that names a file by an absolute `file:` URL can't be used. It
says where files are on a machine wherever it's shared, and it only works
on that machine.

- A JRef `$ref` that's an absolute `file:` URL is a syntax error (see
  [The JSON AST](json-ast.md)), so the document isn't made.
- A document that isn't a file and says it contains a document with a
  `file:` URL is an error, `ERR_ABSOLUTE_FILE_URL` (see
  [Documents](documents.md)). A URL that's given resolved can't be told
  from a relative one in a file, so a file can contain files.
- Checking the document a request comes from stays, for a media type
  plugin that makes references itself.

## Embedded documents

A document can contain others, each with the URL it says it has (see
[Documents](documents.md)). A request an embedded document causes has its
container's record as its initiator, so it's judged by the document it was
found in, not by the URL it says it has. A document from the web that says
it contains a `file:` document can't use it to refer to a file.

Rejected:

- Judging an embedded document by its own URL. A document from the web
  would say it contains a document with a `file:` URL, and that one's
  references to files would be followed.
- A layer, like the `Referer` check of each session's stack in the v2
  prototype. The stack is shared, and the HTTP cache above the transport
  would answer before it, which is why `allowRetrieval` isn't a layer
  either.
- Refusing a `file:` URL without an initiator. The application's own
  requests have none, and they're how it reads its files.
- Checking a document without a record in `browse`, before it fetches. It
  sees the URL that's asked for, but not where a redirect leads or a
  layer that answers a URL like `urn:` with a file.
- A record made up for a document the session didn't retrieve. A trace
  would show a request that wasn't made.
- A document without a record being the application's, since the
  application gave it. What's in the document could have come from
  anywhere, like text from stdin.

## Known limitations

- A document that's being retrieved is shared by whoever asks for it while
  it is, and it's retrieved for the first. If its response is refused for
  that one, because a layer answered it with a file and the first is from
  the web, the others get the refusal too, though they could have
  retrieved it. They can ask for it again.

- It's only as good as the initiators callers give. A caller that follows
  a reference without giving its document as the initiator makes the
  request the application's, which can fetch a `file:` URL.
- An initiator that's a `Response` from somewhere other than a session has
  no record, so it's the same as no initiator.
- A document the session didn't retrieve is only as good as its URL. A
  parser that takes a document's URL from what's in it, like an
  identifier, makes a document that's from the web a file if it says it
  is one.
