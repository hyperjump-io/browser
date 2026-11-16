# Browsing (`src/documents/visit.js`, `select.js`, and `walk.js`)

Browsing is reading nodes and stepping into them while following
references. It's done with the `jref*` functions, which are the unist
utilities for a tree with its references followed. They take the session
to follow references with.

| unist (as written) | JRef (follows references) |
| --- | --- |
| `visit(tree, test, visitor)` (`unist-util-visit`) | `jrefVisit(session, node, test, visitor)` |
| `find(tree, test)` (`unist-util-find`) | `jrefFind(session, node, test)`, `jrefFindAll(session, node, test)` |
| `select(selector, tree)` (`unist-util-select`) | `jrefSelect(session, selector, node)` |
| `selectAll(selector, tree)` (`unist-util-select`) | `jrefSelectAll(session, selector, node)` |

- A step is a selector: `> [key=title]` is the title, and
  `> [key=characters] > *` is each character. A string, number, boolean,
  or null node has its value in `value`, like any unist literal, and a
  selector's `[jsonType=...]` narrows a node to one that has it (see
  Selecting).
  - A family of functions for one step at a time, each named for a
    `json*` function, was rejected: `jrefStep`, `jrefArrayIter`,
    `jrefObjectValues`, `jrefObjectEntries`, `jrefObjectHas`,
    `jrefObjectKeys`, and `jrefValue`. They'd be a second way to browse
    beside the walks, and a selector made of `>` steps retrieves no
    more than they would, because its `[key=...]` rules out a member
    before it's followed. Their iterators would retrieve an item only when
    a loop reached it, so a loop that stops early retrieves less.
    `jrefSelectAll` retrieves every match before it returns, and a walk
    that stops early is `jrefVisit` returning `EXIT`. `jrefValue` would
    have to throw for an object or an array, which `value` doesn't need,
    because those nodes don't have one.
- They're async and follow references, because following one can
  retrieve a document. They're for browsing, where what's needed next
  isn't known until a node is read. Code that computes over documents uses
  `get` and `getDocument` to gather them and the `json*` functions to read
  them, which are synchronous. Only that code knows what it will need, so
  it can retrieve it all at once.
  - Synchronous browsing functions that return references as they are,
    with an async `follow` for a reference, were rejected. Browsing would
    take as many `await`s with a `follow` after every step, and one that's
    left out returns a reference instead of its value. Code that computes
    over documents doesn't use the browsing functions, so it wouldn't gain
    anything, and `follow` would be `get` again.
- They follow references with `get`, the same way an application's own
  function would, giving it the reference as `referencedFrom` (see
  [Documents](documents.md)).
- There's no `jrefPointerGet`. A JSON Pointer in a JRef fragment doesn't go
  through references, so `get` with a fragment does the one correct thing,
  which is to follow the reference the pointer ends at.
- A walk that starts at a reference starts at what it leads to, following
  it the way it follows every member. So a node from a `json*` function,
  which can be a reference, is passed as it is, and `get` and the `jref*`
  functions return followed nodes (`FollowedNode`). The starting node is
  followed after the selector and the options are checked, so a call
  that's a mistake doesn't retrieve anything.
  - Taking only a node that isn't a reference, checked by types, was
    rejected. Every caller with a node from a `json*` function would
    narrow it with `node.type !== "reference"` first, and code that isn't
    type-checked would get a walk of the reference as the object it's
    written as, which looks like an answer and isn't one.
  - Throwing for a reference was rejected. The caller would follow it by
    hand, which is what the walk does for every other reference.
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
  the same keys `[key=...]` matches. It doesn't visit `json-property` or
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
  (`Reachable`): the node it starts at or what's under it, once each is
  followed.

## Finding

- `jrefFind` is `unist-util-find` for the tree with its references
  followed, and `jrefFindAll` is the same for every node that passes. They
  take the session, the node, and a test, in `jrefVisit`'s order, and
  they're `jrefVisit` with a visitor that keeps what it gets. So they find
  in the order a visit does, follow a reference just before its value is
  tested, and take a walk's options. `jrefFind` stops at the first node
  that passes, so nothing after it is retrieved.
- A test is `jrefVisit`'s, so a string is a `type`, as `unist-util-is`
  has it, and what's found is narrowed to what can pass it.
  - `unist-util-find`'s conditions were rejected. Its string matches a
    node whose `value` contains it, so the same string would mean
    something else to `jrefFind` than to `jrefVisit`.
- `jrefFindAll` has each node once, like `jrefSelectAll`, even if it's
  reached through more than one reference. A visit has it each time,
  because a visitor can keep state by where a node is, but a list of what
  was found would only repeat it.
- They're for finding by what a node is. A selector finds by where a node
  is, and it can rule out a member by its key before following it, so
  `jrefSelect` retrieves less for a path.

## How deep a walk goes

- `jrefVisit`, `jrefFind`, `jrefFindAll`, `jrefSelect`, and
  `jrefSelectAll` throw an `ERR_MAX_DEPTH`
  if they'd go more than `maxDepth` levels below the node (`WalkOptions`).
  A reference back to a node that's being walked already ends a walk, but
  references can lead to new documents without end, like a `next` link on
  every page of results. Each document is finite, so only depth through
  references can be unbounded.
- It's a guard and not a way to choose how deep to go. A walk that reaches
  it is almost always a mistake, so it throws instead of returning what it
  found, which would look like everything. A walk that's meant to stop at
  a depth says so: a visitor returns `SKIP` at a `depth`, which it's given
  for that, and a selector of child combinators is only as deep as it's
  written.
  - Stopping at `maxDepth` and going on with the rest of the tree was
    rejected. Results that are missing what's deeper are wrong without
    looking wrong.
  - Returning whether the walk stopped, like `{ nodes, truncated }`, was
    rejected. Every caller would have to check it, and one that doesn't
    has the same wrong results.
- It's only an error if the walk would go under a node at `maxDepth`: the
  visitor didn't skip it, it isn't a reference back to a node that's being
  walked, it has members, and for a selector, one of them could match or
  have a match under it. It's checked before a member is followed, so a
  walk that's too deep doesn't retrieve anything past `maxDepth`.
- The error's `url` is the node the walk would go under, because that's
  where to look for what leads deeper, and its cause has the `maxDepth`.
  `jrefSelectAll` loses what it found when it throws, because it wouldn't
  be everything.
- Limiting the references followed or the documents retrieved was rejected
  for now. They bound the cost of a walk, but not a broad one that's
  shallow, like every person in a film, which is correct to retrieve.
- The default is the parser's nesting limit, 1000 (`MAX_DEPTH` in
  `json-parser.js`), so a walk of one document is never too deep, and a
  walk through references can go as deep as the deepest document.
  `Infinity` turns it off. Any other `maxDepth` that isn't a whole number
  from 0 is a `RangeError`, because it's a mistake in the call.

## Selecting

- `jrefSelect` and `jrefSelectAll` are `unist-util-select`'s `select` and
  `selectAll` for the tree with its references followed. They take the
  session first and then `unist-util-select`'s arguments like the other
  `jref*` functions. They're for reaching values by a path, one step or
  many, or by a pattern.
  - Using `unist-util-select` was rejected. Following a reference is
    async, and it matches against the tree as written, where a reference
    is the object and a value has no key.
- A value doesn't have its key, because the key is on the property's name
  node, so `[key=...]` is a pseudo-attribute that matches the property
  name or array index the value is at. It takes the place of a property
  called `key`, which no JSON or JRef node has. A media type shouldn't
  annotate its nodes with one.
  - A pseudo-class like `:key(director)` was rejected. It can't collide
    with a property, but it's longer for the selector that's used most, and an
    attribute already says "a value that's at this name".
- Selectors are matched top down with every selector of a list at once,
  so a member is only followed if a selector could still match it or
  something under it, and `jrefSelect` stops at the first match. A child
  selector's `[key=...]` rules out a member before it's followed, so
  `> [key=director]` doesn't retrieve a film's characters. A descendant
  selector can match anywhere, so it follows everything under the node.
- A selector that starts with `>` starts at the node like a relative
  selector in `querySelector`, so a path from the node doesn't need
  `:root`.
- `jrefSelectAll` gives each node once in the order they're reached. A
  reference back to a node that's being walked can match, and what's under
  it is walked again only for what it could match that the node it leads
  back to couldn't. In `{ "y": 1, "x": { "$ref": "#" } }`, `[key=x] [key=y]`
  matches `/x/y`, which the root's walk couldn't match. The states a node
  is walked with are finite, so a cycle still ends.
  - Not walking under a reference back to a node that's being walked, as
    `jrefVisit` doesn't, was rejected. A visit's node is the same wherever
    it's reached, but a selector's partial matches aren't, so it would miss
    matches.
- `[name]` matches a node that has the property, whatever its value, like
  `[children]` for objects and arrays. `[name=value]` only matches a
  string, number, boolean, or null.
- What's supported is a `type` or `*`, `[name]`, `[name=value]`, `:root`
  and `:scope`, the descendant and child combinators, and lists. Anything
  else is a `SyntaxError` that says what's supported, as `querySelector`'s
  is. A selector that isn't one is a mistake in the call and not a failure
  to handle, so it doesn't have a code (see
  [Errors with codes](coded-errors.md)).
  - Values are compared as strings like CSS attributes, so `[value=42]`
    matches the number `42` and the string `"42"`. Comparing unquoted
    values as JSON was rejected. Keys and properties like `jsonType` are
    strings, so the common selectors would need quotes.
  - `:has()` was rejected for now. Deciding whether a node matches would
    follow references under it, even for `jrefSelect`, which otherwise
    stops at the first match.
  - Sibling combinators (`+`, `~`) and `:nth-child()` were rejected. An
    object's members aren't ordered in JSON, and an array's are reached by
    `[key=...]`.
  - `:not()` and the other attribute operators (`^=`, `$=`, `*=`) aren't
    supported yet. They could be added without changing what's supported.
- Selectors aren't cached. Parsing one takes microseconds, and a walk that
  follows references takes far longer.
- What's returned is narrowed by the `[jsonType=...]` attributes in the
  last compound of each selector in the list (`Selected`), so
  `> [key=title][jsonType=string]` returns a string node whose `value` is
  a `string`. Reading a scalar is what a selection is most often for,
  and without it every `value` needs a `jsonType` check first. A list is
  narrowed to what any of its selectors selects, and one that isn't
  narrowed makes the list the whole `Reachable`. A selector that isn't a
  string literal isn't narrowed.
  - The types only find the attributes of each last compound, without
    checking the rest of the selector. That takes a step for each attribute
    and for each character of a quoted value, so it's quick to check. An
    invalid selector throws when it's called, so its type doesn't matter,
    but where the types can't read one they don't narrow it.
  - Narrowing by `type` too was rejected for now. A `type` is a media
    type's, and `jsonType` is the one property whose values are known for
    every media type's nodes.
  - Parsing the whole selector in the types, to narrow by `:root` and by
    other properties, was rejected. It would be slow to check, and the
    other properties don't say what kind of value a node is.
- To find references without following them, use `unist-util-select` or
  `unist-util-visit` on the tree as written. The nodes a walk reaches are
  followed, so `[type=reference]` never matches.
