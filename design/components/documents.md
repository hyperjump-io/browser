# Documents (`src/documents/`)

`get` retrieves a document through a session, parses it, and returns the
node a URL identifies in it, following references. `documentOf` gives the
document a node is in. They're what makes this a hypermedia browser, and
the stack is how they retrieve.

- They're functions of a session, `get(session, url)`, not methods of one.
  A session is retrieval, and retrieval never imports document code (see
  [Packaging](packaging.md)). What they need of a session is its `fetch`,
  its `state`, its `contextUrl`, and its `config`.
- The media types are the session's configuration, `mediaTypes`, which
  defaults to `defaultMediaTypes` (see [Media types](media-types.md)). The
  session keeps the configuration it was given as a value and doesn't read
  what isn't its own. `documents.d.ts` adds `mediaTypes` to the
  `HyperjumpConfig` interface, so it's checked where a session is created
  without the session's declaration knowing documents.
- What `get` and `documentOf` return is typed by the session's media
  types: a document any of its plugins makes (`SessionDocument`), and a
  node of one (`SessionNode`). A reference can lead to a document in any of
  them, so it's the union, and the caller tells them apart by `type`.
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
    without a type argument) makes them `unknown`, and so the session's.
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
- `get` takes a `priority`, which is the request's, and the references it
  follows have it too. Whoever waits for a document
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
  - The first document of a `get` is always retrieved, unless it has
    `referencedFrom`. Only a reference finds an embedded document.
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
- Following a reference that leads back to one already followed is an
  error, with the chain of URLs.
- `get` with `follow: false` returns the node its URL identifies as it's
  written, even if it's a reference. It's for code that needs a node of
  the document at the URL, like its root, where following would lead to
  another document. Its type says the node can be a reference.
- There's one function that retrieves, `get`, and `documentOf(session,
  node)` gives the document a node is in. The document at a URL is the one
  its root is in: `documentOf(session, await get(session, url, { follow:
  false }))`.
  - It finds the document the way `referencedFrom` does, described next,
    so it's the embedded document for a node of one, and `undefined` for a
    node the session doesn't have.
  - A document that says it has another URL than its response's, and
    doesn't list itself in its `embedded`, is kept with the contained
    documents under the URL it says it has, so its nodes find it. Nothing
    is found there by URL alone, so it still can't answer for that URL.
- `get` with `referencedFrom`, a node, follows a reference from the
  document the node is in, which is how the browsing functions follow one
  (see [Browsing](browsing.md)). The document is found from the node's
  location: the one the session has at that URL, or one that a document
  contains under it.
  - Two documents can say they contain a document with the same URL, so
    the session keeps the entries of contained documents by URL, and the
    one the node is in is the one where the location's pointer leads to
    that node.
  - A node the session doesn't have, like one an application parsed
    itself, is followed without a document: nothing caused the request,
    and nothing embedded is found.

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

- `getDocument(session, url)`, a second function that retrieved a document
  and returned it, ignoring the fragment and not following references. It
  was `get` without its last two steps, and neither was enough: code with
  a document that needed a node resolved the fragment itself, and code
  with a node from `get` that needed its document looked it up again.
- `get` returning the node with its document, like `{ node, document }`.
  Every caller would destructure, and the browsing functions would take
  and return both, for the few callers that need the document.
- A node that refers to its document. It would be the simplest, since
  nothing would be looked up, but the trees are unist ASTs, which are
  JSON-serializable, and a tree whose nodes refer to their document is
  cyclic.
- `get` and a function for documents as methods of `Hyperjump`. The class
  would import the media types and the parsers, so retrieval would depend
  on documents.
- Methods, with the stack's code depending on a narrower type than
  `Hyperjump` for `ctx.session`. The session's own code, like
  `allowRetrieval` and redirects, would still be in a class that imports
  document code.
- A retrieval class that `Hyperjump` extends with `get` and `documentOf`.
  It's a second class for what two functions do.
- A `Hyperjump` whose configuration type is whatever it's given, so
  document code's keys are allowed in it without being declared.
  TypeScript infers the configuration's type from an object literal only
  when it shares a property with the session's, so
  `new Hyperjump({ mediaTypes })` was an error. `mediaTypes` is declared on
  `HyperjumpConfig`, which the configuration's type extends.
- `get` typed as returning a JRef node, whatever the session's media types
  are. It's only so for a session with the defaults.
- A map from every node to its document, filled when a document is
  parsed. It's a walk of every tree for what one pointer lookup finds.
- The document as an option of `get`, like the v2 prototype's
  `referencedIn`. A caller that has a node doesn't have its document,
  which is what the option would be for.
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
