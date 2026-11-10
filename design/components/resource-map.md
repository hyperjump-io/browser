# The resource map (`src/layers/resource-map.js`)

Resources found while loading, for one session. When a document turns out to
contain others with URLs of their own, whatever parses it registers them,
and the session's requests for those URLs are answered from the map. It's
the idea of a web bundle: one file with several resources, each answering
for its own URL once the file is loaded.

There are three places a response can come from without being fetched:

| | Written by | Lives as long as | Seen by |
| --- | --- | --- | --- |
| The registry | the application, when it's made | the stack | every session |
| The HTTP cache | HTTP responses, by their headers | its store | whoever shares the store |
| The resource map | a parser, by calling `register` | the session | the session and its children |

- It's for a session, in the session's state, so it lives exactly as long
  as the session (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
- A child sees what its parents registered, through its lineage, and its
  parents and siblings don't see what it registers, like a frame that can
  use what its page found. `inherit: false` keeps each session to its own.
  A parser that wants a frame's resources seen by its page registers them
  in `session.root`.
- Registering the same content again is fine, so a document parsed twice
  registers its resources twice. Different content under a URL the session
  has is an error, like a duplicate identifier. A child can register a URL
  its parent has, and its own is what it finds.
- A registration can have the parsed form of the resource, which responses
  have as `responseMeta(response).value`, so a parser that gets it back
  uses the same object instead of parsing the text again.
- It goes at the top of a stack, so what a document says about itself is
  found before anything that's pinned, cached, or fetched.
- Calling `register` is a caller using the layer's methods, not another
  layer. Parsers aren't layers (see
  [How layers communicate](../principles/how-layers-communicate.md)).

Rejected:

- Adding the resources to the registry. A registry's contents are fixed
  when it's made, and these are found while loading, for one session.
- Adding them to the HTTP cache. They don't have HTTP's freshness, and they
  shouldn't outlive the session that found them.
- Keeping them in a child session's own state only. A frame couldn't use
  what its page found.

## Known limitations

- What's registered is seen by every request in the session, not only by
  the document that contains it. A document can say it contains a resource
  with any URL, so a document from somewhere untrusted can change what a
  request for another URL gets, ahead of the registry and the network.
  Applications that load documents they don't trust register only what's
  safe, or keep untrusted documents in sessions of their own.
