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

## Embedded resources

A resource map answers a request with a resource the document said it
contains, at whatever URL it said (see [The resource map](resource-map.md)).
A document from the web can say it contains a `file:` URL. That can't make
a request look like it comes from a file, because the session checks before
the stack does anything with a request. A request for the `file:` URL comes
from the web document, so it's refused before the map could answer it, and
nothing found in that document ever has a `file:` URL to be a referrer.

An embedded resource is judged by its own URL, as everything else about it
is. A resource with an `https:` URL in a local bundle is from the web, so
it can't refer to a file. A document that names a file by absolute URL,
as a reference or a resource's URL, is to be rejected when it's parsed,
because it says where files are on the machine just by being shared. So
nothing that should work is refused. (There are no parsers here yet.)

Rejected:

- Judging a request by where its initiator's content came from, like the
  bundle a resource was found in. Records would need another URL for that,
  which the resource map sets and the session prefers over `finalUrl`, and
  what it allows is a document that's rejected when it's parsed.
- Limiting what a document can register in the resource map. The session's
  check already keeps a document from the web from getting a `file:`
  resource it contains, and the map is given resolved URLs, so it can't
  tell a relative reference in a local bundle from an absolute one.
- A layer, like the `Referer` check of each session's stack in the v2
  prototype. The stack is shared, and the resource map and the HTTP cache
  above the transport would answer before it, which is why `allowRetrieval`
  isn't a layer either.
- Refusing a `file:` URL without an initiator. The application's own
  requests have none, and they're how it reads its files.

## Known limitations

- It's only as good as the initiators callers give. A caller that follows
  a reference without giving its document as the initiator makes the
  request the application's, which can fetch a `file:` URL. With the
  resource map, a missing initiator is safe. Here it isn't.
- An initiator that's a `Response` from somewhere other than a session has
  no record, so it's the same as no initiator.
