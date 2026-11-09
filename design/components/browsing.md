# Browsing (`src/hyperjump/browsing.js`)

Browsing is reading nodes and stepping into them while following
references. It's done with the `jref*` functions, which take the session to
follow references with.

| JSON (as written) | JRef (follows references) |
| --- | --- |
| `jsonPointerGet(pointer, node)` | `session.get(url)` |
| `jsonStep(key, node)` | `jrefStep(session, key, node)` |
| `jsonArrayIter(node)` | `jrefArrayIter(session, node)` |
| `jsonObjectValues(node)` | `jrefObjectValues(session, node)` |
| `jsonObjectEntries(node)` | `jrefObjectEntries(session, node)` |
| `jsonObjectHas(key, node)` | `jrefObjectHas(key, node)` |
| `jsonObjectKeys(node)` | `jrefObjectKeys(node)` |
| `jsonValue(node)` | `jrefValue(node)` |

- The functions that return nodes are async and follow references,
  because following one can retrieve a document. They're for browsing,
  where what's needed next isn't known until a node is read. Code that
  computes over documents, like `@hyperjump/json-schema`'s compiler, uses
  `get` and `getDocument` to gather them and the `json*` functions to read
  them, which are synchronous. Only that code knows what it will need, so
  it can retrieve it all at once.
  - Synchronous browsing functions that return references as they are,
    with an async `follow` for a reference, were rejected. Browsing would
    take as many `await`s with a `follow` after every step, and one that's
    left out returns a reference instead of its value. Code that computes
    over documents doesn't use the browsing functions, so it wouldn't gain
    anything, and `follow` would be `get` again.
- They follow references with the session's public `get`, the same way an
  application's own function would. A session is what decides how
  documents are read. Reading nodes is something done with one.
  - Methods on `Session` were rejected. Nothing overrides them, a bundle
    that doesn't browse, like `@hyperjump/json-schema`'s, has them anyway,
    and they're a second way to write what a function built on `get` does.
- Each one is named for its `json*` counterpart, so the prefix says what it
  does with references: `json*` reads the tree as written, and `jref*`
  follows references. The session comes first and the rest are the
  counterpart's arguments.
  - `jrefObjectHas` and `jrefObjectKeys` are `jsonObjectHas` and
    `jsonObjectKeys`, typed to take a node that isn't a reference. Nothing
    needs following to read a property name, but with them browsing is one
    family of functions. Otherwise a browse would switch between `jref*`
    and `json*` and the user would have to know which is safe.
  - `jrefValue` throws for an object or an array, which `jsonValue`
    doesn't. Getting their value would mean following every reference in
    them, which could retrieve any number of documents. A reference node is
    an object, so it throws for one too.
  - There's no `jrefPointerGet`. A JSON Pointer in a JRef fragment doesn't
    go through references, so `session.get` with a fragment does the one
    correct thing, which is to follow the reference the pointer ends at.
- The `jref*` functions only take a node that isn't a reference
  (`FollowedNode<T>`), and that's checked by types, not at runtime. `get`
  and the `jref*` functions return followed nodes. A node from a `json*`
  function can be a reference, so passing one to a `jref*` function doesn't
  type-check until it's narrowed with `node.type !== "reference"`. Given a
  reference anyway, a `jref*` function reads it as the object it's written
  as.
  - A runtime check in every `jref*` function was rejected. It would only
    help code that isn't type-checked, and it would be in every call.
  - Following a reference a `jref*` function is given, instead of refusing
    it, was rejected. The synchronous functions can't, so the family would
    behave two ways.
