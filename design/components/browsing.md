# Browsing (`src/documents/step.js`, `visit.js`, `select.js`, and `walk.js`)

Browsing is reading values and stepping into them while following
references. It's done with the `jref*` functions. The ones that step into
a value one level are named for the `json*` functions, and the ones that
walk are the unist utilities for a tree with its references followed. They
take the session to follow references with, and a target to start from
(see [Documents](documents.md)).

| As written | JRef (follows references) |
| --- | --- |
| `jsonStep(key, node)` | `jrefStep(session, key, target)` |
| `jsonArrayIter(node)` | `jrefArrayIter(session, target)` |
| `jsonObjectValues(node)` | `jrefObjectValues(session, target)` |
| `jsonObjectEntries(node)` | `jrefObjectEntries(session, target)` |
| `jsonObjectHas(key, node)` | `jrefObjectHas(key, target)` |
| `jsonObjectKeys(node)` | `jrefObjectKeys(target)` |
| `jsonValue(node)` | `jrefValue(target)` |
| `visit(tree, test, visitor)` (`unist-util-visit`) | `jrefVisit(session, target, test, visitor)` |
| `find(tree, test)` (`unist-util-find`) | `jrefFind(session, target, test)`, `jrefFindAll(session, target, test)` |
| `select(selector, tree)` (`unist-util-select`) | `jrefSelect(session, selector, target)` |
| `selectAll(selector, tree)` (`unist-util-select`) | `jrefSelectAll(session, selector, target)` |

- They take a target and give targets. A reference is followed from the
  document it's in, which a node doesn't say, and what's found is given
  with its document so it can be browsed from in turn. A member that isn't
  a reference is in its parent's document, so its target has that
  document.
  - They take a document where they take a target, and browse from its
    root, as a unist utility takes the tree (see
    [Documents](documents.md)).
  - Tests and selectors are about what kind of node a value is, so a
    `type`, an object of properties, and a selector match a target's
    node. A function gets the target, since it can ask anything.
  - Nodes, with a node's document found from its location, was rejected
    (see [Documents](documents.md)).

- There are three ways to browse, for three kinds of code:
  - A walk (`jrefVisit`, `jrefFind`, `jrefFindAll`) decides where to go
    and tells a visitor about each value. It's for doing something at
    every value.
  - A selector (`jrefSelect`, `jrefSelectAll`) reaches values by a path or
    a pattern. `> [key=title]` is the title, and `> [key=characters] > *`
    is each character. What it returns doesn't have its key or where it
    was in the tree.
  - A step (`jrefStep` and the iterators) is one level, asked for by the
    caller. It's for recursion where the caller decides what to step into
    and builds a result from what comes back, like compiling a document
    by what each of its properties means. A visitor can't return a result
    built from a value's members, and a selector's results have no
    structure to build one from, so neither can do that.
- The step functions are named for their `json*` counterparts, so the
  prefix says what it does with references: `json*` reads a node of the
  tree as written, and `jref*` takes a target and follows references. The
  session comes first and the rest are the counterpart's arguments.
  - The iterators (`jrefArrayIter`, `jrefObjectValues`,
    `jrefObjectEntries`) follow a member when a loop reaches it, so a
    loop that stops early retrieves less. They leave out a member that's
    missing from a parse that failed, as the walks do.
  - `jrefStep` to a member that's missing from a parse that failed is an
    `ERR_POINTER_NOT_FOUND`, as it is for a property that doesn't exist,
    and so is `browse` with a fragment that ends at one. `jsonStep` gives
    `undefined` there, but a target is a value's, and a missing value
    isn't a member.
  - They're `@hyperjump/pact`'s async iterators, a `map` over the
    node's children, so `for await` and an engine's helpers work on
    them, calls to `next()` that overlap get the members in order, and
    only a reference is waited for. Once one is done it stays done,
    `return()` ends it, and an error from following a reference ends it
    too. A missing value is only looked for in a node that has one, which
    only a parse that failed does, so the pipeline is one step for any
    other node.
  - `jrefObjectHas` and `jrefObjectKeys` don't take the session. Nothing
    needs following to read a property name, but with them a browse
    doesn't switch between targets and nodes.
  - A document's root can be a value that couldn't be parsed, which a
    `json*` function doesn't take. `jrefStep` into one is an
    `ERR_POINTER_NOT_INDEXABLE`, as `jsonPointerGet` has for a pointer
    that goes into one. `jrefValue` of a missing one is an
    `ERR_POINTER_NOT_FOUND`, as `browse` has, and of an invalid one an
    `ERR_INVALID_VALUE`, as `toJson` has.
  - `jrefValue` throws for an object or an array
    (`ERR_STRUCTURED_VALUE`), which `jsonValue` doesn't. Getting their
    value would mean following every reference in them, which could
    retrieve any number of documents. A string, number, boolean, or null
    node also has its value in `value`, like any unist literal, and a
    selector's `[jsonType=...]` narrows a node to one that has it (see
    Selecting).
  - Rejected: generators for the iterators. They show up when profiling
    code that uses them, and compiling steps through every value of a
    document.
  - Rejected: an async iterator class of this package's, written by
    hand. It was what pact's `map` already is, with pact's rules for
    closing and for calls that overlap written again. On 37 real schemas
    it was within a few percent of pact's.
  - Rejected: stepping only through selectors, like `> [key=title]`. A
    selector is parsed for each step, a key that isn't a plain name needs
    quoting, and what `jrefSelectAll` returns for `> *` doesn't have its
    keys.
  - Rejected: a public `targetFor(target, node)`, for the target of a
    node an application has from a `json*` function. An application would
    be making targets. The step functions return targets, so nothing is
    made by hand.
- `reference: "manual"` doesn't follow references, like `browse`'s option. A
  step function gives the member as it's written, in the same document,
  which can be a reference. A walk visits or selects the tree as it's
  written, as targets, and doesn't follow the target it starts at, so a
  `"reference"` test or `[type=reference]` finds the references in a
  document, each with the document it's followed from. What's returned is
  typed by the option: a node that could be a reference if `reference`
  is, or could be, `"manual"`.
  - Rejected: `unist-util-visit` and the `json*` functions for this, with
    a way to make a target from a node they return. They give nodes, and
    following a reference takes a target.
  - They're async with `"manual"` too, though nothing is followed or
    waited for. It costs a few percent of compiling a schema, which steps
    through every schema as it's written, and a walk of a whole document
    as written is about a quarter of the time parsing it takes (see
    [Async steps as written](../benchmarks/manual-steps.md)).
  - Rejected: synchronous step functions for reading as written, as a
    second set or typed by the option. It's API for a few percent. It's worth
    another look for something that walks whole documents as written
    many times without parsing them again, like an editor on each
    change.
- The ones that give targets are async and follow references, because
  following one can retrieve a document. What's needed next isn't known
  until a value is read, so a reference is followed when it's reached.
  Only a reference is waited for inside a walk or an iterator, so a
  member that isn't one doesn't cost a promise of its own.
  - Synchronous browsing functions that return references as they are,
    with an async `follow` for a reference, were rejected. Browsing would
    take as many `await`s with a `follow` after every step, and one that's
    left out returns a reference instead of its value.
- A reference that can't be followed is an error from the function that
  followed it: what `browse` throws (see [Documents](documents.md)). It ends
  a walk, as it ends an iterator. Code that carries on past one, like
  lint, browses as written and follows each reference with `browse`, so it
  has the reference, its document, and why it couldn't be followed, and
  decides for each what to do.
  - Rejected: a walk that gives the visitor the error and goes on, like an
    `onError` option or an error in place of a target. A caller that
    carries on needs each reference as it's written and why it failed,
    which is what browsing as written and `browse` give it, and it doesn't
    always want what a reference leads to walked. `jrefFind`,
    `jrefFindAll`, `jrefSelect`, and `jrefSelectAll` would find less
    without saying so, which is why `maxDepth` throws too.
- They follow references with `browse`, the same way an application's own
  function would, giving it the target the reference is in as
  `referencedFrom` (see [Documents](documents.md)).
- There's no `jrefPointerGet`. A JSON Pointer in a JRef fragment doesn't go
  through references, so `browse` with a fragment does the one correct thing,
  which is to follow the reference the pointer ends at.
- A walk that starts at a reference starts at what it leads to, following
  it the way it follows every member. So a target whose node is a
  reference, like one from `jrefStep` with `reference: "manual"`, is
  passed as it is, and the nodes of the targets `browse` and the `jref*`
  functions return are followed (`FollowedNode`) unless they're told not
  to. The starting target is followed after the
  selector and the options are checked, so a call that's a mistake doesn't
  retrieve anything. A target that isn't followed is returned as it is,
  not as a copy.
  - Taking only a node that isn't a reference, checked by types, was
    rejected. Every caller with a target that could be a reference would
    narrow it with `node.type !== "reference"` first, and code that isn't
    type-checked would get a walk of the reference as the object it's
    written as, which looks like an answer and isn't one.
  - Throwing for a reference was rejected. The caller would follow it by
    hand, which is what the walk does for every other reference.
- They take a target with a node of any tree, like the `json*` functions
  take a node of one, and not only a JRef one. All they need of a node is
  what a reference is: a `reference` node with an `href`. So what's built
  on browser browses its own trees with them, like a tree with more kinds
  of node. A tree the session didn't retrieve is browsed from its
  document, and its references find what the document contains.
- What they return is typed by where a node can come from. A value or an
  item that isn't a reference is a node of the tree it's in. A reference
  can lead to a document in any of the session's media types, so it's a
  node of any of those (`SessionNode`, see [Documents](documents.md)). The
  caller tells them apart by `type`. A target's document is the one the
  walk started in or any of the session's, and its type isn't tied to its
  node's, so narrowing a node by its `jsonType` stays simple.
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
  already read it as written. `CONTINUE`, `SKIP`, and `EXIT` are the same
  values as `unist-util-visit`'s.
- It visits values, as targets, with the key they're at and the target of
  the value that has them, the same keys `[key=...]` matches. It doesn't visit `json-property` or
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
  `unist-util-is`. The node of the visitor's target is narrowed to what
  can pass it, so `{ jsonType: "number" }` gives a number node.
  - The walk still goes through nodes that don't pass and follows their
    references, because what passes can be under them. A node that
    doesn't pass can't be skipped, because the visitor doesn't get it.
  - A function test gets the target, the key, and the parent's target
    instead of a node and an index, the same as the visitor. One that's a
    type predicate is a predicate on the target.
  - Converting tests with `unist-util-is` was rejected. Its function tests
    take an index, and it throws for a key that isn't a number.
  - An array of tests can't have arrays in it. A recursive test type makes
    TypeScript's inference too deep for a function test, and
    `unist-util-is`'s arrays are one level too.
  - A function test that isn't a type predicate doesn't narrow. An object
    test with a property no node type has narrows to `never`, because no
    node can pass it.
- What the visitor's target is typed as is what a walk can reach
  (`ReachableTarget`): the target it starts at or what's under it, once
  each is followed. Its node is a `Reachable`.

## Finding

- `jrefFind` is `unist-util-find` for the tree with its references
  followed, and `jrefFindAll` is the same for every node that passes. They
  take the session, the target, and a test, in `jrefVisit`'s order, and
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
  reached through more than one reference, and so one target for it. A visit has it each time,
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
- To find references without following them, select with
  `reference: "manual"`. Otherwise the nodes a walk reaches are followed,
  so `[type=reference]` never matches.
