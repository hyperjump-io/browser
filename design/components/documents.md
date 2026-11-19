# Documents (`src/documents/`)

`browse` retrieves a document through a session, parses it, and returns the
target a URL identifies in it, following references. It's what makes this
a hypermedia browser, and the stack is how it retrieves.

## Targets

A target is what a URL identifies: a node and the document it's in
(`Target`, `{ document, node }`).

- A node isn't enough to go on from. A reference only means something in
  the document it's in, which says what it finds, what caused the request,
  and whether it can refer to a file. So what follows a reference takes a
  target, and what finds a value returns one. unist meets the same need
  inside one tree: `unist-util-visit` gives a node's `parent` with it.
- The document is the one that was retrieved. A node of a contained
  document has its container, because the contained document is found from
  the container and not the other way.
- Nothing makes a target by hand. `browse` and the `jref*` functions return
  them (see [Browsing](browsing.md)).
- Where a target is taken, so is a document, which stands for its root
  (`Start`). A document is the tree, so a tree from a unified pipeline is
  read as it is. A target is told from a document by its `node`.
- A document can have any parse status, as unified's `parse` returns. A
  document with nothing in it has a missing root, which isn't a value, so
  it has no target: a walk visits nothing, and `browse` is an
  `ERR_POINTER_NOT_FOUND`.

Rejected:

- `browse` returning only the node. The caller would look up its document
  again to follow a reference in it.
- Finding a node's document from its location. It searches for what
  `browse` already had, and two documents can say they contain a document
  with the same URL.
- A map from every node to its document. It's a walk of every tree for
  what a target already has.
- A node that refers to its document. unist trees are JSON-serializable,
  and that one would be cyclic.
- A target whose document is the contained document its node is in. The
  container couldn't be found from it.
- A public way to make a target, like `documentTarget(document, mediaType)`
  or `{ ...target, node }`. Code that makes one is missing a function, and
  it's wrong when a target has more than it copied.
- A class for a target. It holds no state.
- Visiting a missing root, or taking only documents that aren't
  `failure`. A walk would give a target `browse` says isn't there, or a
  tree with a valid root couldn't be read without a cast.

## `browse`

- It's a function of a session, `browse(session, url)`, not a method. A
  session is retrieval, and retrieval never imports document code (see
  [Packaging](packaging.md)). It uses the session's `fetch`, `state`,
  `contextUrl`, and `config`.
- It's named for what a browser does with a URL: retrieve the page, go to
  what the fragment identifies, and follow redirects without being asked.
  `reference: "manual"` is `redirect: "manual"`'s counterpart.
- It follows the reference its URL ends at, and any that leads to, until
  there's a value. A request a reference causes has the referring
  document's record as its `initiator`, so a trace shows it under that
  document (see [`file:` from `file:`](file-references.md)).
- With `reference: "manual"`, the target is the node as written. It's how
  code reads a document as a whole, like finding every reference in it.
  What's returned is typed by the option (`BrowseTarget`). There's no
  `"error"`, because nothing needs a reference to be a failure.
- A reference back to one already followed is `ERR_REFERENCE_CYCLE`.
  More than `maxReferences` (20) in a row is `ERR_TOO_MANY_REFERENCES`,
  checked before the next one is retrieved, so a server that answers each
  reference with another can't make the session retrieve without end. Of
  7,133 references followed in the 57 SchemaStore schemas in
  `sourcemeta/jsonschema-benchmark`, 22 led to another reference and none
  to a third.
  - It's a session option, not `browse`'s, so the `jref*` functions are
    covered without passing it on.
- `browse` takes no `signal`. A document being retrieved is shared, so one
  caller's abort can't abort its request, and `maxReferences` bounds what
  it retrieves.
- `priority` is the request's and the references it follows. Whoever waits
  for a document adds its priority to the document's `PriorityGroup`, so a
  tool preloading at `low` doesn't hold up one that's needed now (see
  [Priorities](priorities.md)). The `jref*` functions take none: what they
  read is needed now.
- `referencedFrom`, a target or a document, follows a reference from that
  document, which is how the `jref*` functions follow one. A relative URL
  resolves against the document's URL, not the context URL. A document the
  session didn't retrieve has no record, so its URL is the request's
  `referrer` (see [`file:` from `file:`](file-references.md)). It isn't
  kept and answers for no URL.

Rejected:

- `browse` as a method of `Hyperjump`, or of a class `Hyperjump` extends.
  Retrieval would import documents, or a second class would do what a
  function does.
- `get`, `getTarget`, `dereference`, `resolve`, `load`, and
  `fetchDocument`. Too generic, a word users must learn first, jargon that
  suggests inlining every reference, what's done to a relative URL, or
  names that say it returns a document.
- `getDocument(session, url)` beside `browse`. `browse` with
  `reference: "manual"` already returns it.
- A `follow: false` option. A boolean doesn't say what else could be done,
  and a request's option for the same choice is `redirect`.

## Media types and types

- The plugins are the session's `mediaTypes`, defaulting to
  `defaultMediaTypes` (see [Media types](media-types.md)).
  `documents.d.ts` adds `mediaTypes` to `HyperjumpConfig`, so it's checked
  where a session is made without the session's declaration knowing
  documents.
- What `browse` returns is typed by the session's media types
  (`SessionDocument`, `SessionTarget`). A reference can lead to any of
  them, so it's the union, told apart by `type`. The session's type
  carries its configuration's (`Hyperjump<C>`). Without `mediaTypes` it's
  the defaults. With `mediaTypes` that might not be there, it's both.
- The constructor is declared apart (`HyperjumpConstructor`), so
  `new Hyperjump()` has the defaults and `Hyperjump` is any session.
- A plugin without a type argument makes `unknown` documents.

Rejected:

- A configuration typed as whatever it's given. TypeScript infers from an
  object literal only when it shares a property with the declared type, so
  `new Hyperjump({ mediaTypes })` was an error.
- `browse` typed as returning a JRef node whatever the media types are.
- The media types as an option of `browse`. Every call would pass them, and
  a session's documents were parsed with one list.

## What a session keeps

- Each document it retrieves, in its state, by URL without a fragment. It
  holds promises, so a document that's asked for again during its load is
  the same one, and one referred to twice is fetched once. To see changes, use a
  new session (see
  [State lives as long as what it's for](../principles/state-lifetimes.md)).
- Also by the URL its response came from, like where a redirect led or the
  file a symbolic link points to, so there's one document for a URL however it was reached.
- Not by the document's own `url`, which a media type with identifiers
  gives it. A document could then answer for any URL it names.
- A redirect's `Location` fragment wins over the request's, as in the
  Fetch standard. It's kept for the URL that redirected, not for where it
  led.
- A document that fails isn't kept, so it can be asked for again.
- A kept document is only given to a cause that could have retrieved it
  (see [`file:` from `file:`](file-references.md)). A refused cause's
  request is still fetched and recorded, but whoever else waits isn't
  refused.
- Each entry keeps its response's fetch record.

Rejected:

- Keeping documents by what caused them. A document would be retrieved
  again for each referrer, and two targets of one URL would have different
  documents.
- Giving the session a document it didn't retrieve. It would answer for a
  URL it wasn't retrieved from.

## Fragments

- A document's `anchors` map a fragment to the JSON Pointer of the node it
  names. What a fragment identifies is a pure function of the document
  (`fragmentPointer`), so nothing needs the plugin once a document is
  parsed, and a tree from anywhere can be read.
- Without `anchors`, any fragment identifies the whole document, like
  JSON. With them, a fragment is an anchor's pointer, or else a
  percent-encoded JSON Pointer. JRef's are `{}`. Keys are percent-encoded,
  as in a URL.
- Anything else, including a fragment that doesn't decode or has a bad
  `~`, is `ERR_ANCHOR_NOT_FOUND`. It's checked before `jsonPointerGet`,
  whose `TypeError` is for a caller's mistake.

Rejected:

- The plugin on every entry and target, for `fragmentPointer`. A unified
  tree has no plugin, and one plugin can make documents whose fragments
  differ.
- A document that names its media type. A session without the plugin
  couldn't browse it.
- A plugin's `parse` returning a target, or the root's target on a unified
  file's `data`. A unified tree doesn't come from `parse`, and `data` goes
  stale when a transformer returns a new tree.

## Embedded documents

`parse` gives a document the documents it contains (`embedded`), by the
URL each says it has. A reference looks in its document's set, then the
session's, then fetches.

- A document is in its own set, so a tree the session didn't retrieve can
  refer to itself with `#/a` and find the tree, not what's at its URL.
- An embedded document shares its container's set and record, so its
  requests have the container's record as `initiator`. Its fragments are
  its own.
- It isn't kept under its own URL. Only its container's references find
  it, so what a document says it contains can't change what another
  document finds.
- The first document of a `browse` is always retrieved. An embedded one
  isn't, so `allowRetrieval` doesn't apply.
- Its URL is parsed when its container loads. One that isn't a URL keeps
  the container from being used.

Rejected:

- A document listing itself in `embedded`. The tree would be cyclic.
- Retrieving the URL for a self-reference. An editor's unsaved tree would
  be read from disk.

## Requests

- A URL is parsed where it comes in, against the context URL, and a
  document's URL is its response's (see
  [Identifiers are URLs](../principles/identifiers-are-urls.md)).
- `Accept` is the session's media types (`acceptHeader`), as a request
  header, so it wins over the session's `headers`. It's worked out once
  per session.
- The plugin is the one for the `Content-Type`, or for a `file:` URL's
  extension, since a file has none (see [The `file:` scheme](file-scheme.md)).

## Errors

A network error is the session's and a syntax error is the plugin's.
Anything else that keeps a document from being used is an `Error` with a
`cause.code` (see [Errors](errors.md)). It isn't a `TypeError`, because a
server answered. A response that can't be used has its body cancelled.

Rejected:

- One error that wraps every reason, like a `RetrievalError`. Code would
  dig in the cause, and a network error would stop being what `fetch`
  rejects with.
- Error classes (see [Errors](errors.md)).

## Known limitations

- `browse` takes nodes to be a JSON AST, with references as `reference`
  nodes that have an `href`.
- A media type whose fragments aren't names or JSON Pointers, like CSV's
  `#row=5`, can't say so with `anchors`.
