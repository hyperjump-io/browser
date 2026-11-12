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
- The session checks it with `allowRetrieval`, everywhere `allowRetrieval`
  is checked (see [What a session can fetch](allow-retrieval.md)): the URL
  that's asked for, before its headers are found, where each redirect
  leads, and a response's URL that isn't the one asked for. So a redirect,
  even with `file:` in `redirectSchemes`, or a layer that answers a URL
  like `urn:` with a file, can't take a document from the web to a file.
  It's checked first, because adding the URL to `allowRetrieval` wouldn't
  help.
- A refused reference is a network error, like a URL `allowRetrieval`
  refuses, and it's recorded the same way, without the session's headers.
  Its message names the URL and the document, and says only a `file:`
  document can refer to a `file:` URL.
- It's for every session, with no option to turn it off. A document whose
  references to files are meant to be followed is a file.
- A `data:` document isn't a file, so it can't refer to one. Its content
  could have come from anywhere.

Rejected:

- A layer, like the `Referer` check of each session's stack in the v2
  prototype. The stack is shared, and the HTTP cache above the transport
  would answer before it, which is why `allowRetrieval` isn't a layer
  either.
- Refusing a `file:` URL without an initiator. The application's own
  requests have none, and they're how it reads its files.

## Known limitations

- It's only as good as the initiators callers give. A caller that follows
  a reference without giving its document as the initiator makes the
  request the application's, which can fetch a `file:` URL.
- An initiator that's a `Response` from somewhere other than a session has
  no record, so it's the same as no initiator.
