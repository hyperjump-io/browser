# Documents (`src/documents/`)

`get` retrieves a document through a session, parses it, and returns the
target a URL identifies in it, following references. It's what makes this
a hypermedia browser, and the stack is how it retrieves.

- A target is what a URL identifies: a node and the document it's in
  (`Target`, `{ document, node }`). A URL names a document, and its
  fragment names a part of it, which is its media type's to define. `get`
  finds both, and a target is both.
  - A node isn't enough to go on from. A reference only means something in
    the document it's in, which says what the reference finds before
    anything is retrieved, what caused the request, and whether it can
    refer to a file. So what follows a reference takes a target, and what
    finds a value returns one.
  - The document is the one that was retrieved. A node of a document that
    one contains has its container, because the contained document is
    found from the container by the node's location, and the container
    can't be found from the contained document.
  - It's a plain value. A member of a target's node is in the same
    document, so its target is `{ ...target, node: member }`, which the
    browsing functions make for each member and an application can too.
  - The session keeps the entry of each document it retrieved by the
    document, which is how it knows a target's.

- It's a function of a session, `get(session, url)`, not a method of one.
  A session is retrieval, and retrieval never imports document code (see
  [Packaging](packaging.md)). What it needs of a session is its `fetch`,
  its `state`, its `contextUrl`, and its `config`.
- The media types are the session's configuration, `mediaTypes`, which
  defaults to `defaultMediaTypes` (see [Media types](media-types.md)). The
  session keeps the configuration it was given as a value and doesn't read
  what isn't its own. `documents.d.ts` adds `mediaTypes` to the
  `HyperjumpConfig` interface, so it's checked where a session is created
  without the session's declaration knowing documents.
- What `get` returns is typed by the session's media types: a target
  with a document any of its plugins makes (`SessionDocument`) and a node
  of one (`SessionTarget`). A reference
  can lead to a document in any of them, so it's the union, and the caller
  tells them apart by `type`.
  - The session's type has its configuration's (`Hyperjump<C>`), which is
    where the plugins' types are read from. `defaultMediaTypes` is typed
    as the two plugins it is, so a list made from it keeps them.
  - It's read from the type of the session's configuration. With
    `mediaTypes`, it's what those plugins make. Without them, like a
    session created without a configuration, it's what the defaults make.
    With `mediaTypes` that might not be there, like a session that's only
    known as a `Hyperjump` or a configuration that's only known as a
    `HyperjumpConfig`, it's both, so nothing is assumed.
  - The constructor is declared apart from the session's type
    (`HyperjumpConstructor`), so `new Hyperjump()` is a session without a
    configuration and `Hyperjump` is any session. As a class, both would
    have one default, and either a session created without media types
    wouldn't be known to have the defaults or any session would be taken
    to.
  - A plugin that doesn't say what its documents are (`MediaTypePlugin`
    without a type argument) makes them `unknown`, and so the session's. A
    target of such a session is still a target, whose document and node
    are `unknown`.
- A session keeps each document it retrieves, in its state, by the
  document's URL without a fragment. The cache holds promises, so a
  document that's asked for again while it's being fetched or parsed is
  the same one, and a document referred to twice is fetched once. To see
  changes, an application uses a new session (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
- A document is also kept under the URL its response came from, like where
  a redirect led or the file a symlink points to. A document that's
  reached at a URL the session already has a document for is that
  document, so there's one for a URL however it was reached.
  - It isn't kept under its own `url`. A media type whose documents say
    what their URL is, like one with an identifier in it, gives a document
    that `url`, and its nodes' locations start with it. If that were where
    it's kept, a document could answer for any URL it names. Such a
    document finds itself by that URL when its plugin lists it in its own
    `embedded`.
- A document that fails isn't kept, so it can be asked for again.
- `get` takes a `priority`, which is the request's, and
  the references `get` follows have it too. Whoever waits for a document
  adds its priority to the document's (`PriorityGroup`) until its wait is
  over, so the request has the most urgent priority of whoever is waiting.
  A tool that preloads documents at `low` doesn't hold up one that's
  needed now (see [Priorities](priorities.md)). It matters where the stack
  orders requests by priority: the scheduler does, which the default stack
  has in Node.js, and the throttle does, which it doesn't.
  - The browsing functions don't take a priority. What's being browsed is
    needed now, which is `auto`.
- An entry keeps the plugin that parsed it, which says what its fragments
  identify, and its response's fetch record. A document carries neither.
- A plugin's `parse` gives a document the documents it contains
  (`embedded`), parsed, by the URL each says it has. A reference looks in
  its document's set first, then in what the session has, then it's
  fetched.
  - An embedded document has its container's set, plugin, and record. So
    it finds the others its container has, its fragments are its
    container's media type's, and a request it causes has its container's
    record as its `initiator`.
  - It isn't kept under its own URL, and only a reference from its
    container, or from a document contained with it, finds it. A document
    can say it contains a document with any URL, so what it says can't
    change what another document's reference finds.
  - The first document of a `get` is always retrieved. Only a reference
    finds an embedded document.
  - It isn't retrieved, so `allowRetrieval` doesn't apply to it.
  - Its URL is parsed, without a fragment, when its container is loaded.
    One that isn't a URL keeps the container from being used.
- A URL is parsed where it comes in, against the session's context URL,
  and the document's URL is its response's (see
  [Identifiers are URLs](../principles/identifiers-are-urls.md)). A
  response a layer made without a URL has the URL that was asked for.
- A request has the `Accept` header for the session's media types
  (`acceptHeader`), as a request header, which wins over the session's
  `headers`. It's worked out once for a session, when it first gets a
  document, so a quality that isn't one throws there.
- The plugin is the one for the response's `Content-Type`. A `file:`
  response has none, so it's the one for its URL's extension (see
  [The `file:` scheme](file-scheme.md)).
- `get` follows the reference its URL ends at, and any that leads to,
  until there's a value. A request a reference causes has the record of
  the document the reference is in as its `initiator`, so a trace shows it
  under that document, and a document from the web can't refer to a file
  (see [`file:` from `file:`](file-references.md)).
- With `reference: "manual"`, `get` doesn't follow the reference its URL
  ends at, so the target is the node as it's written and the document at
  the URL. It's how code gets a document to read as a whole, like one that
  finds every reference in it, and how it sees that a document's root is
  a reference. It's named for a request's `redirect`, which a session
  already has, and `"follow"` is the default, so references are followed
  unless a caller says otherwise.
  - What it returns is typed by the option: a node that could be a
    reference if `reference` is, or could be, `"manual"` (`GetTarget`).
  - `"error"`, like a request's, isn't there. Nothing needs a reference
    to be a failure.
- Following a reference that leads back to one already followed is an
  error, with the chain of URLs.
- `get` with `referencedFrom`, a target, follows a reference from the
  target's document, which is how the browsing functions follow one (see
  [Browsing](browsing.md)).
  - A target whose document the session didn't retrieve, like a tree an
    application parsed itself, is followed without a document: nothing
    caused the request, and nothing embedded is found.
  - With `referencedFromMediaType`, such a document's references find
    what it contains. The document has what it contains, and the session
    doesn't know its media type, which says what the fragments of those
    documents identify, so the application says it. Nothing caused the
    request, since the document wasn't retrieved. It doesn't change what
    the session has: the document isn't kept, and it doesn't answer for
    any URL.

## Errors

A network error is the session's, and a syntax error is the plugin's. What
else keeps a document from being used is an `Error` whose `cause.code`
says why, with the exact URL as its `url` (see
[Errors with codes](coded-errors.md)):

| Code | Failure |
| --- | --- |
| `ERR_HTTP_STATUS` | A response that isn't a success. The cause has its `status`. |
| `ERR_UNSUPPORTED_MEDIA_TYPE` | A response no media type plugin parses |
| `ERR_ABSOLUTE_FILE_URL` | A document that isn't a file and says it contains a document with a `file:` URL (see [`file:` from `file:`](file-references.md)) |
| `ERR_REFERENCE_CYCLE` | References that lead back to one already followed. The cause has the `chain`. |

They're `Error`s, not the `TypeError` of a network error, because a server
answered. A response that can't be used has its body cancelled, so its
file or connection is released.

Rejected:

- `get` as a method of `Hyperjump`. The class would import
  the media types and the parsers, so retrieval would depend on documents.
- Methods, with the stack's code depending on a narrower type than
  `Hyperjump` for `ctx.session`. The session's own code, like
  `allowRetrieval` and redirects, would still be in a class that imports
  document code.
- A retrieval class that `Hyperjump` extends with `get`. It's a second
  class for what a function does.
- A `Hyperjump` whose configuration type is whatever it's given, so
  document code's keys are allowed in it without being declared.
  TypeScript infers the configuration's type from an object literal only
  when it shares a property with the session's, so
  `new Hyperjump({ mediaTypes })` was an error. `mediaTypes` is declared on
  `HyperjumpConfig`, which the configuration's type extends.
- `get` typed as returning a target with a JRef node, whatever the session's media types
  are. It's only so for a session with the defaults.
- A `getDocument(session, url)` for the document at a URL, beside `get`.
  They retrieved the same way and differed in what they returned, and
  with a target, `get` without following returns what it did.
- A `follow: false` option. A boolean doesn't say what else could be done
  with a reference, and a request's option for the same choice is
  `redirect`, with `"follow"` and `"manual"`.
- `get` returning only the node. What it's given to next needs the
  node's document: to follow a reference in it, or to read what a plugin
  puts on a document. The caller would look it up again, or keep its own
  record of which document each node came from.
- `referencedFrom` as a node, with its document found from the node's
  location: among the documents the session has and the ones they
  contain, the one where the location's pointer leads to that node. It
  searches for what `get` had when it found the node, and it needs the
  entries of contained documents kept by URL, since two documents can say
  they contain a document with the same URL.
- Giving the session a document it didn't retrieve, to keep with the
  ones it did. A document would answer for a URL without being retrieved
  from it, and the session's documents would be changed from outside.
- The media type of a document it didn't retrieve on the target. A
  target is what a URL identifies, and every other target's media type
  is the session's to know.
- A map from every node to its document, filled when a document is
  parsed. It's a walk of every tree for what a target already has.
- A node that refers to its document. The trees are unist trees, which
  are JSON-serializable, and a tree whose nodes refer to their document
  is cyclic.
- A target whose document is the contained document its node is in. The
  container, which is what a reference is followed from and what a
  message names, couldn't be found from it.
- A class for a target. It holds no state of its own, and an application
  couldn't make one for a member with a spread.
- The media types as an option of `get`. Every call would pass them, and
  the documents a session keeps were parsed with one list.
- One error that wraps whatever kept a document from being retrieved, like
  a `RetrievalError` with a cause. Code would look in the cause for every
  reason, and a network error would stop being what `fetch` rejects with.
- Error classes. A code is a value (see
  [Network errors](network-errors.md)).

## Known limitations

- `get` takes the nodes of a document to be a JSON AST, with references
  as `reference` nodes that have an `href`.
