# Documents (`src/documents/`)

`browse` retrieves a document through a session, parses it, and returns the
target a URL identifies in it, following references. It's what makes this
a hypermedia browser, and the stack is how it retrieves.

- A target is what a URL identifies: a node and the document it's in
  (`Target`, `{ document, node }`). A URL names a document, and its
  fragment names a part of it. `browse` finds both, and a target is both.
  - A node isn't enough to go on from. A reference only means something in
    the document it's in, which says what the reference finds before
    anything is retrieved, what caused the request, and whether it can
    refer to a file. So what follows a reference takes a target, and what
    finds a value returns one.
  - The document is the one that was retrieved. A node of a document that
    one contains has its container, because the contained document is
    found from the container by the node's location, and the container
    can't be found from the contained document.
  - It's a plain value, and nothing makes one by hand. `browse` returns
    one, and the `jref*` functions return one for each member they step
    into or walk to (see [Browsing](browsing.md)).
  - Where a target is taken, so is a document, which stands for its
    root's target (`Start`): by the `jref*` functions and as
    `referencedFrom`. A unist utility takes the tree, and a document is
    the tree, so a tree from a unified pipeline, or one an application
    parsed itself, is read as it is. A target is told from a document
    by its `node`.
  - A document can have any parse status, since that's what unified's
    `parse` returns and lint works on a tree that failed. So its root
    can be a value that couldn't be parsed, and what's returned is typed
    with it. A target's node is still a value, as a `json*` function's
    node is.
  - A document with nothing in it has a root that's missing, which isn't
    a value, so there's no target of it: a walk of it visits nothing, and
    `browse` for it is an `ERR_POINTER_NOT_FOUND`. A member that's missing
    isn't one either (see [Browsing](browsing.md)).
    - Rejected: visiting the missing root, as the node the walk was
      started at. A walk would give a target that `browse` says isn't
      there, and the only target whose node isn't a value.
    - Rejected: only a document whose status isn't `failure`
      (`hasStatus`). A tree that failed with a root that's a value
      couldn't be read without a cast, and a walk already leaves out
      what's missing.
  - unist has the same need inside one tree, and meets it the same way.
    A node doesn't say its parent, so `unist-util-visit` gives the
    `parent` with it. A target is that for a tree that spans documents:
    the node with the root it's under.
  - The session keeps the entry of each document it retrieved by the
    document, which is how it knows what caused a target's document to
    be retrieved.

- It's a function of a session, `browse(session, url)`, not a method of one.
  A session is retrieval, and retrieval never imports document code (see
  [Packaging](packaging.md)). What it needs of a session is its `fetch`,
  its `state`, its `contextUrl`, and its `config`.
- It's named `browse` for what a browser does with a URL. A browser
  retrieves the page, goes to what the fragment identifies, and follows
  redirects without being asked. `browse` retrieves the document, goes to
  what the fragment identifies, and follows references the same way, and
  `reference: "manual"` is `redirect: "manual"`'s counterpart. What it
  returns is where the URL leads, which is a target. Browsing is `browse`
  and the `jref*` functions that go on from where it leads.
- The media types are the session's configuration, `mediaTypes`, which
  defaults to `defaultMediaTypes` (see [Media types](media-types.md)). The
  session keeps the configuration it was given as a value and doesn't read
  what isn't its own. `documents.d.ts` adds `mediaTypes` to the
  `HyperjumpConfig` interface, so it's checked where a session is created
  without the session's declaration knowing documents.
- What `browse` returns is typed by the session's media types: a target
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
- A redirect's `Location` can have a fragment, which the Fetch standard
  has win over the request's. The response's URL never has one, so it's
  the last URL in `responseMeta(response).redirects`. `browse` uses it
  instead of the fragment it was asked for, for the URL it's given and a
  reference it follows. The session keeps it for the URL that redirected,
  because the document is fetched once, and not for the URL the redirect
  led to, which has no redirect when it's asked for itself. A document
  that's found embedded in another isn't fetched, so it has none.
  - It isn't kept under its own `url`. A media type whose documents say
    what their URL is, like one with an identifier in it, gives a document
    that `url`, and its nodes' locations start with it. If that were where
    it's kept, a document could answer for any URL it names. Such a
    document still finds itself by that URL, as every document does.
- A document that fails isn't kept, so it can be asked for again.
- A document the session has is only given to a cause that could have
  retrieved it (see [`file:` from `file:`](file-references.md)): only a
  `file:` document can refer to the URL that's asked for, if it's a
  `file:` URL, and to the URL the document's response came from.
  `allowRetrieval` is the session's, so a document it has passed it
  already.
  - A URL a cause can't refer to is still fetched, so the session refuses
    it and records that, but it isn't kept. The refusal is for that cause,
    so whoever else is waiting for the URL doesn't get it.
  - Keeping documents by what caused them was rejected. A document would
    be retrieved again for each document that refers to it, and two
    targets of the same URL would have different documents.
- `browse` takes a `priority`, which is the request's, and
  the references `browse` follows have it too. Whoever waits for a document
  adds its priority to the document's (`PriorityGroup`) until its wait is
  over, so the request has the most urgent priority of whoever is waiting.
  A tool that preloads documents at `low` doesn't hold up one that's
  needed now (see [Priorities](priorities.md)). It matters where the stack
  orders requests by priority: the scheduler does, which the default stack
  has in Node.js, and the throttle does, which it doesn't.
  - The `jref*` functions don't take a priority. What they read is
    needed now, which is `auto`.
- An entry keeps its response's fetch record, which a document doesn't
  carry.
- A document says what its fragments identify, with its `anchors`: a map
  from a fragment to the JSON Pointer of the node it names. What a
  fragment identifies is a pure function of the document
  (`fragmentPointer` in `documents.js`), so nothing needs the plugin once
  a document is parsed, and a tree from anywhere can be read.
  - Without `anchors`, a document has no fragments, and any fragment
    identifies the whole document. JSON's are like that.
  - With `anchors`, even with none in it, a fragment is an anchor's
    pointer if it's there, and otherwise a JSON Pointer that's
    percent-encoded. A JRef document's is `{}`.
  - A fragment that's neither is an `ERR_ANCHOR_NOT_FOUND`. One that
    doesn't percent-decode, like `/a%`, or has a `~` that isn't `~0` or
    `~1`, like `/a~2`, isn't a JSON Pointer, so it's one too. It's checked
    before `jsonPointerGet` is called, whose `TypeError` is for a caller's
    mistake, and a fragment is the document's.
  - An anchor's key is the fragment as it is in a URL, percent-encoded.
- A plugin's `parse` gives a document the documents it contains
  (`embedded`), parsed, by the URL each says it has. A reference looks in
  its document's set first, then in what the session has, then it's
  fetched.
  - A document is in its own set, by its `url`, so a reference to the
    document it's in finds it. A tree the session didn't retrieve, like
    one from a unified pipeline, can refer to itself with `#/a`, and what
    it finds is the tree and not what's at its URL. Only its own
    references and those of the documents it contains find it, so it
    still doesn't answer for the URL to anything else. A document it
    lists at its own URL comes first.
    - Rejected: a document that lists itself in its own `embedded` to be
      found. The tree would be cyclic, and every parser would do it.
    - Rejected: retrieving the URL. A tree that isn't saved, like an
      editor's, would be read from what's on disk.
  - An embedded document has its container's set and record. So it finds
    the others its container has, and a request it causes has its
    container's record as its `initiator`. Its fragments are its own,
    from its own `anchors`.
  - It isn't kept under its own URL, and only a reference from its
    container, or from a document contained with it, finds it. A document
    can say it contains a document with any URL, so what it says can't
    change what another document's reference finds.
  - The first document of a `browse` is always retrieved. Only a reference
    finds an embedded document.
  - It isn't retrieved, so `allowRetrieval` doesn't apply to it.
  - Its URL is parsed, without a fragment, when its container is loaded.
    One that isn't a URL keeps the container from being used.
- A URL is parsed where it comes in, against the session's context URL,
  and the document's URL is its response's (see
  [Identifiers are URLs](../principles/identifiers-are-urls.md)). A
  response a layer made without a URL has the URL that was asked for,
  from the session (see [Sessions](sessions.md)).
- A request has the `Accept` header for the session's media types
  (`acceptHeader`), as a request header, which wins over the session's
  `headers`. It's worked out once for a session, when it first gets a
  document, so a quality that isn't one throws there.
- The plugin is the one for the response's `Content-Type`. A `file:`
  response has none, so it's the one for its URL's extension (see
  [The `file:` scheme](file-scheme.md)).
- `browse` follows the reference its URL ends at, and any that leads to,
  until there's a value. A request a reference causes has the record of
  the document the reference is in as its `initiator`, so a trace shows it
  under that document, and a document from the web can't refer to a file
  (see [`file:` from `file:`](file-references.md)).
- With `reference: "manual"`, `browse` doesn't follow the reference its URL
  ends at, so the target is the node as it's written and the document at
  the URL. It's how code gets a document to read as a whole, like one that
  finds every reference in it, and how it sees that a document's root is
  a reference. It's named for a request's `redirect`, which a session
  already has, and `"follow"` is the default, so references are followed
  unless a caller says otherwise.
  - What it returns is typed by the option: a node that could be a
    reference if `reference` is, or could be, `"manual"` (`BrowseTarget`).
  - `"error"`, like a request's, isn't there. Nothing needs a reference
    to be a failure.
- Following a reference that leads back to one already followed is an
  error, with the chain of URLs.
- Following more than `maxReferences` references in a row is an error
  too, `ERR_TOO_MANY_REFERENCES`, checked before the next one is followed,
  so nothing past the limit is retrieved. Each reference can lead to a new
  document, so a server that answers each one with a reference to another
  would have the session retrieve documents without end, and a cycle only
  ends a chain that comes back. It's like `maxRedirects`, and its default
  is the same, 20. Of 7,133 references followed in the 57 SchemaStore
  schemas in `sourcemeta/jsonschema-benchmark`, 22 led to another
  reference, and none to a third.
  - It's a session option, next to `mediaTypes`, and not one of
    `browse`'s. The `jref*` functions follow references with `browse`, so
    one setting covers them, without each passing it on.
  - A `signal` for `browse` was left out. A document that's being
    retrieved is shared by whoever asks for it, so one caller's abort
    can't abort its request, and with a limit, `browse` makes at most one
    request more than `maxReferences`.
- `browse` with `referencedFrom`, a target or a document, follows a
  reference from that document, which is how the `jref*` functions
  follow one (see [Browsing](browsing.md)). Only the document is read, so
  a node a unist utility found in a tree is followed with the tree.
  - A relative URL is resolved against the document's URL, as a reference
    in it is, not against the context URL. A reference is followed from
    its document, and the context URL isn't where it's written. For a
    target, it's the target's `document`, which contains any document its
    node is in.
  - A document the session didn't retrieve, like a tree from a unified
    pipeline, is followed from like any other: it has what it contains
    and what its fragments identify. It has no record, since it wasn't
    retrieved, so a request it causes has its URL as the `referrer`
    instead of an initiator. It's judged by where it is, and a trace shows
    the request at the top (see [`file:` from `file:`](file-references.md)).
    It doesn't change what the session has: the document isn't kept, and
    it doesn't answer for any URL.

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
| `ERR_ANCHOR_NOT_FOUND` | A fragment that isn't an anchor of the document or a JSON Pointer. The cause has the `anchor`. |
| `ERR_REFERENCE_CYCLE` | References that lead back to one already followed. The cause has the `chain`. |
| `ERR_TOO_MANY_REFERENCES` | More than the session's `maxReferences` references in a row. The cause has the `maxReferences` and the `chain`. |

They're `Error`s, not the `TypeError` of a network error, because a server
answered. A response that can't be used has its body cancelled, so its
file or connection is released.

Rejected:

- `browse` as a method of `Hyperjump`. The class would import
  the media types and the parsers, so retrieval would depend on documents.
- Methods, with the stack's code depending on a narrower type than
  `Hyperjump` for `ctx.session`. The session's own code, like
  `allowRetrieval` and redirects, would still be in a class that imports
  document code.
- `get`. It's too generic to say anything on its own, and likely to
  collide with something else an application imports.
- `getTarget`. It names what it returns with a word a user has to learn
  first.
- `dereference`. It's the precise term for what it does, but it's
  jargon, and to someone who knows JSON tooling it suggests a document
  with every reference inlined.
- `resolve`, which is what's done to a relative URL, and `load` or
  `fetchDocument`, which say it returns a document, not a target.
- A retrieval class that `Hyperjump` extends with `browse`. It's a second
  class for what a function does.
- A `Hyperjump` whose configuration type is whatever it's given, so
  document code's keys are allowed in it without being declared.
  TypeScript infers the configuration's type from an object literal only
  when it shares a property with the session's, so
  `new Hyperjump({ mediaTypes })` was an error. `mediaTypes` is declared on
  `HyperjumpConfig`, which the configuration's type extends.
- `browse` typed as returning a target with a JRef node, whatever the session's media types
  are. It's only so for a session with the defaults.
- A `getDocument(session, url)` for the document at a URL, beside `browse`.
  They retrieved the same way and differed in what they returned, and
  with a target, `browse` without following returns what it did.
- A `follow: false` option. A boolean doesn't say what else could be done
  with a reference, and a request's option for the same choice is
  `redirect`, with `"follow"` and `"manual"`.
- `browse` returning only the node. What it's given to next needs the
  node's document: to follow a reference in it, or to read what a plugin
  puts on a document. The caller would look it up again, or keep its own
  record of which document each node came from.
- `referencedFrom` as a node, with its document found from the node's
  location: among the documents the session has and the ones they
  contain, the one where the location's pointer leads to that node. It
  searches for what `browse` had when it found the node, and it needs the
  entries of contained documents kept by URL, since two documents can say
  they contain a document with the same URL.
- Giving the session a document it didn't retrieve, to keep with the
  ones it did. A document would answer for a URL without being retrieved
  from it, and the session's documents would be changed from outside.
- A target with its document's media type plugin, which said what a
  fragment identifies (`fragmentPointer`, a function of the plugin's). A
  tree from a unified pipeline has no plugin with it, so something had
  to pair them, and the plugin was carried on every entry and target for
  one function. One plugin can also make two kinds of document, whose
  fragments differ.
- A document that names its media type, with the session finding the
  plugin by the name. It carried the plugin's name for the same one
  function, and a session without the plugin couldn't browse the tree.
- `documentTarget(document, mediaType)`, to make the target of a
  document the session didn't retrieve. An application made targets, and
  nothing checked that the plugin parsed the document.
- A plugin's `parse` returning a target. A tree from a unified pipeline
  doesn't come from a plugin's `parse`.
- The root's target on a unified file's `data`, put there by the parse
  plugin. It's stale when a transformer returns a new tree, it's missing
  for `processor.run(tree)`, and a transformer would pass it where it
  has the tree.
- A session that knows the media type of each document it retrieved,
  with nothing for one it didn't. A reference in a document it didn't
  retrieve was followed without the document, so nothing the document
  contains was found.
- A target made by hand, like `{ ...target, node: member }`. Code that
  does is missing a function, and it's wrong when a target has more than
  it copied.
- A map from every node to its document, filled when a document is
  parsed. It's a walk of every tree for what a target already has.
- A node that refers to its document. The trees are unist trees, which
  are JSON-serializable, and a tree whose nodes refer to their document
  is cyclic.
- A target whose document is the contained document its node is in. The
  container, which is what a reference is followed from and what a
  message names, couldn't be found from it.
- A class for a target. It holds no state of its own.
- The media types as an option of `browse`. Every call would pass them, and
  the documents a session keeps were parsed with one list.
- One error that wraps whatever kept a document from being retrieved, like
  a `RetrievalError` with a cause. Code would look in the cause for every
  reason, and a network error would stop being what `fetch` rejects with.
- Error classes. A code is a value (see
  [Network errors](network-errors.md)).

## Known limitations

- `browse` takes the nodes of a document to be a JSON AST, with references
  as `reference` nodes that have an `href`.
- A media type whose fragments aren't names or JSON Pointers, like CSV's
  `#row=5`, can't say so with `anchors`.
