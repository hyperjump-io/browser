# The resource map (`src/layers/resource-map.js`)

Resources found in documents. When a document turns out to contain others
with URLs of their own, whatever parses it registers them in the document,
and requests the document causes for those URLs are answered from the map.
It's the idea of a web bundle: one file with several resources, each
answering for its own URL once the file is loaded.

There are three places a response can come from without being fetched:

| | Written by | Lives as long as | Seen by |
| --- | --- | --- | --- |
| The registry | the application, when it's made | the stack | every session |
| The HTTP cache | HTTP responses, by their headers | its store | whoever shares the store |
| The resource map | a parser, by calling `register` | the session | requests the document causes |

## Like a web bundle

A web bundle can't answer for any URL it likes. A page loads one with a
rule that lists the URLs it answers, and it answers them only for that
page. Other pages, and the page's other requests, are fetched as usual. A
bundle answers only for its own origin unless its resources are signed by
theirs. Which URLs a bundle says it has isn't what decides who gets them.

The resource map keeps that rule. Here the document is the bundle and the
page together: it contains the resources, and its references are the
requests they answer. So a resource answers only requests the document
that contains it causes.

- `register(container, url, entry)` puts a resource in a document's set.
  The container is a response from a session, or its record. A record is
  the identity of one response, so the same URL fetched twice is two
  documents, each with a set of its own.
- A request is answered from the set of its initiator. The caller says what
  caused a request (`initiator`), like the document a reference is in, and
  the layer reads it as `ctx.record.initiator`. A request without one is
  fetched.
- A response the map answers has its container's set. So a resource finds
  the others its document contains, and one registered in it is in that
  set too. A document and everything found in it are one bundle.
- A request caused by a document that was fetched, even one the bundle
  refers to, has that document's set, not the bundle's.
- Registering the same content again is fine, so a document parsed twice
  registers its resources twice. Different content under a URL the
  document has is an error, like a duplicate identifier. Two documents can
  have the same URL with different content. Each finds its own.
- The sets are kept in the session's state, in a `WeakMap` by record, so
  they live as long as the session and the records do (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
  A request in another session, like a frame's, finds what its initiator
  contains, wherever the initiator was fetched.
- A registration can have the parsed form of the resource, which responses
  have as `responseMeta(response).value`, so a parser that gets it back
  uses the same object instead of parsing the text again.
- It goes at the top of a stack, so what a document says it contains is
  found before anything that's pinned, cached, or fetched. Each step of a
  redirect has the request's context, so a redirect to a URL the document
  contains is answered from the map too.
- Calling `register` is a caller using the layer's methods, not another
  layer. Parsers aren't layers (see
  [How layers communicate](../principles/how-layers-communicate.md)).

Rejected:

- A set for each session, seen by every request in it, with child sessions
  seeing their parents'. A document can say it contains a resource with any
  URL, so a document from somewhere untrusted could change what any other
  request in the session gets, ahead of the registry and the network.
- Limiting the URLs a document can register, like to its own origin, as a
  web bundle does. It would still let a document change what other
  documents from its origin get. Once a resource answers only its own
  document, a document that says it contains anything can only change what
  it gets itself, so there's nothing for the limit to protect.
- Finding a document's set by its URL. A response the map answers has
  whatever URL the document says, so a document could say it contains
  another's URL and get its set. And a URL that's in two documents, or
  also fetched by itself, would be ambiguous.
- Answering a request caused by any document the bundle led to. A bundle
  that refers to another document, and contains a resource under a URL
  that document refers to, would change what the other document gets.
- Adding the resources to the registry. A registry's contents are fixed
  when it's made, and these are found while loading, for one session.
- Adding them to the HTTP cache. They don't have HTTP's freshness, and they
  shouldn't outlive the session that found them, or be seen by other
  documents.

## Known limitations

- A request is answered from the map only when the caller gives its
  initiator. A caller that doesn't is fetched as usual, which is safe, but
  the resource isn't found.
- Nothing found while loading can answer every request in a session. An
  application that has resources it trusts for everything puts them in
  the registry when it builds the stack.
