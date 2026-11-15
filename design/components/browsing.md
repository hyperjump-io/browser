# Browsing (`src/documents/browsing.js`)

Browsing is reading nodes and stepping into them while following
references. It's done with the `jref*` functions, which take the session to
follow references with.

| JSON (as written) | JRef (follows references) |
| --- | --- |
| `jsonPointerGet(pointer, node)` | `get(session, url)` |
| `jsonStep(key, node)` | `jrefStep(session, key, node)` |
| `jsonArrayIter(node)` | `jrefArrayIter(session, node)` |
| `jsonObjectValues(node)` | `jrefObjectValues(session, node)` |
| `jsonObjectEntries(node)` | `jrefObjectEntries(session, node)` |
| `jsonObjectHas(key, node)` | `jrefObjectHas(key, node)` |
| `jsonObjectKeys(node)` | `jrefObjectKeys(node)` |
| `jsonValue(node)` | `jrefValue(node)` |
| `visit(tree, test, visitor)` (`unist-util-visit`) | `jrefVisit(session, node, test, visitor)` |

- The functions that return nodes are async and follow references,
  because following one can retrieve a document. They're for browsing,
  where what's needed next isn't known until a node is read. Code that
  computes over documents uses `get` and `getDocument` to gather them and
  the `json*` functions to read them, which are synchronous. Only that
  code knows what it will need, so it can retrieve it all at once.
  - Synchronous browsing functions that return references as they are,
    with an async `follow` for a reference, were rejected. Browsing would
    take as many `await`s with a `follow` after every step, and one that's
    left out returns a reference instead of its value. Code that computes
    over documents doesn't use the browsing functions, so it wouldn't gain
    anything, and `follow` would be `get` again.
- They follow references with `get`, the same way an application's own
  function would, giving it the reference as `referencedFrom` (see
  [Documents](documents.md)).
- Each one is named for its `json*` counterpart, so the prefix says what it
  does with references: `json*` reads the tree as written, and `jref*`
  follows references. The session comes first and the rest are the
  counterpart's arguments.
  - `jrefObjectHas` and `jrefObjectKeys` are `jsonObjectHas` and
    `jsonObjectKeys`, typed to take a node that isn't a reference. Nothing
    needs following to read a property name, but with them browsing is one
    family of functions. Otherwise a browse would switch between `jref*`
    and `json*` and the user would have to know which is safe.
  - `jrefValue` throws for an object or an array (`ERR_STRUCTURED_VALUE`),
    which `jsonValue` doesn't. Getting their value would mean following every reference in
    them, which could retrieve any number of documents. A reference node is
    an object, so it throws for one too.
  - There's no `jrefPointerGet`. A JSON Pointer in a JRef fragment doesn't
    go through references, so `get` with a fragment does the one correct
    thing, which is to follow the reference the pointer ends at.
- The `jref*` functions only take a node that isn't a reference
  (`FollowedNode`), and that's checked by types, not at runtime. `get` and
  the `jref*` functions return followed nodes. A node from a `json*`
  function can be a reference, so passing one to a `jref*` function doesn't
  type-check until it's narrowed with `node.type !== "reference"`. Given a
  reference anyway, a `jref*` function reads it as the object it's written
  as.
  - A runtime check in every `jref*` function was rejected. It would only
    help code that isn't type-checked, and it would be in every call.
  - Following a reference a `jref*` function is given, instead of refusing
    it, was rejected. The synchronous functions can't, so the family would
    behave two ways.
- They take a node of any tree, like the `json*` functions do, and not
  only a JRef one. All they need of a node is what a reference is: a
  `reference` node with an `href`. So what's built on browser browses its
  own trees with them, like a tree with more kinds of node.
- What they return is typed by where a node can come from. A value or an
  item that isn't a reference is a node of the tree it's in. A reference
  can lead to a document in any of the session's media types, so it's a
  node of any of those (`SessionNode`, see [Documents](documents.md)). The
  caller tells them apart by `type`.
  - The type of the node that was given, for what's returned, was
    rejected. It says a reference leads to a document like the one it's
    in, which isn't so: a document can refer to one in another media type.
  - A node with only `type: string`, which is all that's certain without
    the session, was rejected. It can't be narrowed to a kind of node, so
    every caller would cast.

## Visiting

- `jrefVisit` is `unist-util-visit` for the tree with its references
  followed. Its counterpart is `unist-util-visit` and not a `json*`
  function because the tree is a unist tree and the ecosystem's utilities
  already read it as written. `visit(document, "reference", ...)` gathers a
  document's references without following them, which is what code that
  computes over documents needs before it retrieves. `CONTINUE`, `SKIP`,
  and `EXIT` are the same values as `unist-util-visit`'s.
- It visits values with the key they're at and the value that has them,
  the same keys `jrefStep` takes. It doesn't visit `json-property` or
  `json-property-name` nodes. A reference's value isn't in the document
  the reference is in, so a unist `index` into its parent's `children`
  wouldn't find it, and the browsing functions deal in values.
- The visitor also gets the node's depth below the node the visit starts
  at, so returning `SKIP` at a depth is how a visit goes only so deep.
- Each member is followed just before it's visited and not all of a
  node's members first, so `SKIP` and `EXIT` keep the session from
  retrieving what isn't visited.
- A value reached through two references is visited each time because
  it's in the tree twice. A reference back to a value that's being visited
  is visited, but its members aren't, so a recursive definition ends the
  walk instead of making it infinite. What's being visited is told by the
  node and not its location, because two documents can say they have the
  same URL, like two that say they contain the same document.
  - An `ERR_REFERENCE_CYCLE` was rejected. A recursive definition, like a
    tree whose children are trees, is a valid document whose references
    all resolve.
  - Visiting each location once was rejected. A visitor that keeps state
    by its key or parent, like one that builds a value, would miss every
    place a shared value is used after the first.
- The visitor can be async, so it can retrieve what it needs, and it's
  awaited before the walk goes on.
- A test before the visitor picks the nodes the visitor gets, as
  `unist-util-visit`'s does, with `unist-util-is`'s kinds of test: a
  `type`, an object of properties that are `===`, a function, or an array
  of those. `null` or `undefined` passes every node, as it does in
  `unist-util-is`. The visitor's node is narrowed to what can pass it, so
  `{ jsonType: "number" }` gives a number node.
  - The walk still goes through nodes that don't pass and follows their
    references, because what passes can be under them. A node that
    doesn't pass can't be skipped, because the visitor doesn't get it.
  - A function test gets the key and the parent instead of an index, the
    same as the visitor.
  - Converting tests with `unist-util-is` was rejected. Its function tests
    take an index, and it throws for a key that isn't a number.
  - An array of tests can't have arrays in it. A recursive test type makes
    TypeScript's inference too deep for a function test, and
    `unist-util-is`'s arrays are one level too.
  - A function test that isn't a type predicate doesn't narrow. An object
    test with a property no node type has narrows to `never`, because no
    node can pass it.
- What the visitor's node is typed as is what a walk can reach
  (`Reachable`): the node it starts at, or what's under it once it's
  followed, the same as what `jrefStep` returns.
