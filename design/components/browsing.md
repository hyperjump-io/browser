# Browsing (`src/documents/step.js`, `visit.js`, `select.js`, and `walk.js`)

Browsing is `browse` and the `jref*` functions that go on from where it
leads (see [Documents](documents.md)). The ones that step one level are
named for the `json*` functions, and the ones that walk are the unist
utilities, for a tree with its references followed. They take the session
first, then the counterpart's arguments with a target for the node.

| As written | JRef (follows references) |
| --- | --- |
| `jsonStep(key, node)` | `jrefStep(session, key, target)` |
| `jsonArrayIter(node)` | `jrefArrayIter(session, target)` |
| `jsonObjectValues(node)` | `jrefObjectValues(session, target)` |
| `jsonObjectEntries(node)` | `jrefObjectEntries(session, target)` |
| `jsonObjectHas(key, node)` | `jrefObjectHas(session, key, target)` |
| `jsonObjectKeys(node)` | `jrefObjectKeys(session, target)` |
| `jsonValue(node)` | `jrefValue(session, target)` |
| `node.jsonType` | `jrefJsonType(session, target)` |
| `node.type === "reference"` | `jrefIsReference(target)` |
| `node.href` | `jrefHref(target)` |
| `node.location` | `jrefLocation(target)` |
| | `jrefFollow(session, target)` |
| `visit(tree, test, visitor)` (`unist-util-visit`) | `jrefVisit(session, target, test, visitor)` |
| `find(tree, test)` (`unist-util-find`) | `jrefFind(session, target, test)`, `jrefFindAll(session, target, test)` |
| `select(selector, tree)` (`unist-util-select`) | `jrefSelect(session, selector, target)` |
| `selectAll(selector, tree)` (`unist-util-select`) | `jrefSelectAll(session, selector, target)` |

- They take a target or a document and give targets, because a reference
  is followed from its document (see [Documents](documents.md)). Tests and
  selectors match a target's node. A function test gets the target.
- There are three ways to go on, for three kinds of code:
  - A walk (`jrefVisit`, `jrefFind`, `jrefFindAll`) does something at every
    value.
  - A selector (`jrefSelect`, `jrefSelectAll`) reaches values by a path or
    a pattern, like `> [key=characters] > *`. What it returns has no key or
    structure.
  - A step (`jrefStep` and the iterators) is one level, for recursion that
    builds a result from what comes back, like compiling a document. A
    visitor can't return one, and a selector's results have no structure.
- They're async, because following a reference can retrieve a document,
  and what's needed next isn't known until a value is read. Only a
  reference is waited for, so other members don't cost a promise.
- They follow references with `browse` and `referencedFrom`, as an
  application's own function would. A reference that can't be followed
  throws what `browse` throws and ends a walk or an iterator.
- A walk or a step that starts at a reference starts at what it leads to,
  after the selector and options are checked, so a mistaken call retrieves
  nothing. A target that isn't followed is returned as it is.
- They take a target with a node of any tree, not only JRef. All they need
  is a `reference` node with an `href`, so what's built on the browser can
  browse its own trees.
- What's returned is typed by where a node can come from: a member that
  isn't a reference is in its parent's tree, and a reference can lead to
  any of the session's media types (`SessionNode`), told apart by `type`.

Rejected:

- Synchronous `jref*` functions with an async `follow`. It's as many
  `await`s, and a missed `follow` returns a reference instead of a value.
- A walk that gives the visitor errors and goes on, like `onError`. Code
  that carries on past a broken reference, like lint, browses as written
  and follows each with `browse`, so it has the reference and why it
  failed. A find would find less without saying so.
- Taking only nodes that aren't references, or throwing for one. Every
  caller would check `node.type` first, and untyped code would walk the
  reference as an object, which looks like an answer.
- The type of the node given, for what's returned. A reference can lead to
  another media type. A node with only `type: string` can't be narrowed.
- A `jrefPointerGet`. A JRef fragment's pointer doesn't go through
  references, so `browse` with a fragment is the one correct way.
- A public `targetFor(target, node)`. Applications would be making targets.

## Steps

- The iterators (`jrefArrayIter`, `jrefObjectValues`, `jrefObjectEntries`,
  `jrefObjectKeys`) follow a member when a loop reaches it, so a loop that
  stops early retrieves less. They're `@hyperjump/pact`'s async iterators,
  a `map` over the node's children, so overlapping `next()` calls get
  members in order.
- Every `jref*` function leaves out a member that's missing from a failed
  parse, as walks do. `jrefStep` to one is `ERR_POINTER_NOT_FOUND`, because
  a target is a value's. `jsonObjectKeys` and `jsonObjectHas` have it,
  because they read the tree as written.
- `jrefObjectHas`, `jrefObjectKeys`, `jrefJsonType`, and `jrefValue` take the
  session and are async, because the target can be a reference. They don't
  follow members.
- `jrefJsonType` is the followed node's `jsonType`. A target from
  `reference: "manual"` that's a reference has `jsonType` `"object"`, as
  it's written.
- `jrefValue` throws `ERR_STRUCTURED_VALUE` for an object or an array,
  because getting its value would follow every reference in it. A scalar
  also has its value in `value`, and `[jsonType=...]` narrows a selection
  to one.
- A root that couldn't be parsed is `ERR_POINTER_NOT_INDEXABLE` to step
  into, and `ERR_POINTER_NOT_FOUND` or `ERR_INVALID_VALUE` for `jrefValue`
  and `jrefJsonType`, as `browse` and `toJson` have.
- `jrefFollow` gives what a target leads to, or the target itself, for code
  that follows references itself, like loading them in parallel.
- `jrefIsReference`, `jrefHref`, and `jrefLocation` read the target as
  written, so they're synchronous and don't take the session.
  `jrefIsReference` is a type predicate that narrows for `jrefHref`, which
  throws a `TypeError` for anything else, a mistake in the call.
  `jrefLocation` of a reference is where the reference is, the place to
  report it broken.

Rejected:

- Not taking the session in `jrefObjectKeys` and friends. Given a
  reference as written, `jrefObjectKeys` gave `["$ref"]`, which looks like
  an answer.
- A type predicate for each kind of value, like `isJrefString`. Following
  is async, so it can't narrow.
- `browse` with `href` and `referencedFrom` for `jrefFollow`. Every caller
  wrote the same three lines. `jrefSelect(session, ":scope", target)`
  works but doesn't say it follows.
- `jrefHref` giving `undefined` for a target that isn't a reference. Every
  URL would need a check, even where a test found only references.
- `jrefLocation` following the target. Where a reference leads is
  `jrefLocation(jrefFollow(...))`.
- Generators, or an async iterator class of this package's. Generators
  show up in profiles, and a class would rewrite pact's `map`.
- Stepping only through selectors. A selector is parsed for each step,
  keys need quoting, and `> *` loses its keys.

## As written

`reference: "manual"` doesn't follow, like `browse`'s option. A step reads
and gives members as written. A walk visits or selects the tree as written,
so a `"reference"` test or `[type=reference]` finds a document's
references, each with its document. What's returned is typed by the
option.

- They're still async. An async step is 300–400 nanoseconds a node, 12–21 times a
  synchronous one, which is a few percent of compiling a schema, and a
  walk of a whole document as written is about a quarter of parsing it.

Rejected:

- `unist-util-visit` and the `json*` functions, with a way to make a
  target from their nodes. Following a reference takes a target.
- Synchronous steps for reading as written. It's API for a few percent.
  It's worth another look for something that walks whole documents as
  written many times without parsing them again, like an editor.

## Visiting

- `jrefVisit` is `unist-util-visit` for the tree with references followed.
  `CONTINUE`, `SKIP`, and `EXIT` are `unist-util-visit`'s.
- It visits values, as targets, with their key and their parent's target.
  It doesn't visit property nodes, and a unist `index` wouldn't find a
  reference's value. The visitor also gets the depth, so `SKIP` at a depth
  limits how deep it goes.
- Each member is followed just before it's visited, so `SKIP` and `EXIT`
  keep the session from retrieving what isn't visited.
- A value reached through two references is visited each time. A
  reference back to a value being visited is visited, but not its members,
  so a recursive definition ends. What's being visited is told by node,
  not location, since two documents can say they have the same URL.
- The visitor can be async and is awaited.
- A test is `unist-util-is`'s kinds: a `type`, an object of properties, a
  function, an array of those, or `null`. The visitor's node is narrowed to
  what can pass it (`ReachableTarget`). The walk still goes through nodes
  that don't pass, since matches can be under them.
  - A function test gets the target, key, and parent like the visitor.
  - Arrays can't nest. A recursive test type makes inference too deep.

Rejected:

- `ERR_REFERENCE_CYCLE` for a recursive definition. It's a valid document.
- Visiting each location once. A visitor that keeps state by key or
  parent would miss every use of a shared value after the first.
- `unist-util-is` for tests. Its function tests take an index, and it
  throws for a key that isn't a number.

## Finding

- `jrefFind` and `jrefFindAll` are `unist-util-find` for the followed tree,
  in `jrefVisit`'s order and with its tests and options. `jrefFind` stops
  at the first match.
- `jrefFindAll` has each node once, so a find walks under a value once. A
  value reached again is tested but not walked again. Walking each time
  costs the document as a tree, which for a few kilobytes that refer to
  each level twice is too big to walk.
- A test that can only pass a reference is a `TypeError`, before anything
  is retrieved, because a followed walk never reaches one. A function
  test, or one with a part that can pass something else, isn't checked.
- A selector finds by where a node is and can rule out a member before
  following it, so `jrefSelect` retrieves less for a path.

Rejected:

- `unist-util-find`'s conditions. Its string matches a node whose `value`
  contains it, unlike `jrefVisit`'s.
- Returning nothing for a reference-only test. Untyped code gets no hint,
  and the walk runs until `maxDepth`.

## How deep a walk goes

- Walks and selections throw `ERR_MAX_DEPTH` if they'd go more than
  `maxDepth` levels below the start. Cycles already end, but references can
  lead to new documents without end, like a `next` link on every page.
- It's a guard, not a way to choose depth, so it throws rather than return
  what looks like everything. A walk meant to stop uses `SKIP` at a
  `depth`, or a selector of child combinators.
- It's an error only if the walk would really go under a node at the
  limit: not skipped, not a cycle, has members, could match, and for a find
  or selection not walked under already. It's checked before a member is
  followed, so nothing past it is retrieved.
- The error's `url` is the node it would go under. `jrefSelectAll` loses
  what it found.
- The default is the parser's nesting limit, 1000, so one document is
  never too deep. `Infinity` turns it off, and anything else that isn't a
  whole number from 0 is a `RangeError`.

Rejected:

- Stopping at `maxDepth` and going on, or returning `{ nodes, truncated }`.
  Results that miss what's deeper look right, and every caller would have
  to check.
- Limiting references followed or documents retrieved. A broad, shallow
  walk, like every person in a film, is correct to retrieve.

## Stopping a walk

- A visit costs the document as a tree. A few kilobytes whose levels each
  refer to the next one twice is too big to visit, and `maxDepth` doesn't
  stop it. So walks take a `signal`, checked at each node, rejecting with
  its `reason`. An aborted one rejects before anything is retrieved. A
  retrieval it waits for isn't aborted, because it's the session's.
- A walk of documents the session has waits only for settled promises, so
  no other task would run, not even the timer that aborts it. So a walk
  waits for the next task every 1000 nodes (`pace` in `walk.js`),
  `setImmediate` in Node.js and a `MessageChannel` in a browser
  (`#next-task`). A node is about 600 nanoseconds, so that's about a millisecond.
  It cost less than run-to-run noise in Node.js 26, Chromium 157, and
  Firefox 160, and a 10 ms timer ran at about 11 ms instead of after the
  walk. Every 100 nodes cost a third of a walk in Chromium, where a wait is
  16 µs.
- Finds and selections take a `signal` too, since a document can be large
  or lead to many more.
- A visit also has a guard, `maxRevisits`, for applications that pass no
  signal. It's `ERR_MAX_REVISITS` to revisit nodes more than `maxRevisits`
  times in all, 250,000 by default, and more than 100 times for each node
  reached. Finds and selections walk under a node once, so they don't take
  it.
  - A value used in many places is visited once per reference, and those
    references are reached first, so that alone is never an error.
    Revisiting more than 100 times each takes sharing nested many times
    over.
  - Comparing with nodes reached makes it about a document's shape, not its
    size, so a hostile document's cost grows with its size: about 1 s for
    1.6 KB and 13.5 s for 800 KB.
  - Of the 57 SchemaStore schemas in `sourcemeta/jsonschema-benchmark`, a
    grammar (`cql2`) revisited 126,782 times, 180 for each node reached,
    and the largest (`biome`) 619,115 times, 25.5 for each. No other
    passed 7 for each. The default fits `cql2` with twice the room it
    needs, and the comparison lets `biome` through.
  - Keeping every node reached and visited costs a followed visit about
    30%: 185 ms against 130 ms for 220,000 nodes and no references. It's
    one map, of whether each node reached is visited, since a node is
    reached when it's visited unless it's a reference. A set of each
    looked up each node twice as often and cost 40%. A visit with
    `reference: "manual"` walks a tree and keeps nothing.

Rejected:

- A nested `setTimeout`. A browser waits at least 4 ms.
- `scheduler.yield`, for now. Safari 18.4 doesn't have it.
- Pausing by time. It reads a clock at each node.
- Counting revisits for each node. A big value revisited a few times visits
  all its nodes each time, so a padded document's work grows with the
  square of its size: 112 s for 21 KB.
- A limit on visits, or on revisits with no comparison. A correct broad
  walk makes many, and allowing `biome` lets a hostile document run as
  long.
- Comparing with references followed, not nodes. `biome`'s nested sharing
  made it an error.
- Another default. Smaller fails `cql2`. A million lets 1.6 KB run 4 s.

## Selecting

- `jrefSelect` and `jrefSelectAll` are `unist-util-select` for the
  followed tree.
- `[key=...]` is a pseudo-attribute for the property name or index a value
  is at, since a value doesn't have its key. A media type shouldn't
  annotate nodes with a `key`.
- Every selector in a list is matched top down at once, so a member is
  followed only if a selector could still match it or under it. `>
  [key=director]` doesn't retrieve a film's characters. A descendant
  selector follows everything.
- A selector that starts with `>` is relative to the node, like
  `querySelector`'s.
- `jrefSelectAll` gives each node once, in the order reached. A node is
  walked under once for each set of partial matches, so a cycle back can
  still match what the first pass couldn't, like `[key=x] [key=y]` in
  `{ "y": 1, "x": { "$ref": "#" } }`, and still ends. The cost is the
  nodes times their states, not the tree.
- `[name]` matches having the property, and `[name=value]` only a scalar.
  Values compare as strings, like CSS, so `[value=42]` matches `42` and
  `"42"`.
- Supported: a `type` or `*`, `[name]`, `[name=value]`, `:root`, `:scope`,
  descendant and child combinators, and lists. Anything else is a
  `SyntaxError` with no code, a mistake in the call.
- Selectors aren't cached. Parsing one takes microseconds.
- What's returned is narrowed by the `[jsonType=...]` attributes in the
  last compound of each selector (`Selected`), because reading a scalar is
  what selection is most for. The types read only those attributes, so
  checking is quick. One they can't read isn't narrowed.
- Without `reference: "manual"`, `[type=reference]` never matches, so a
  selector whose every part needs a reference is a `TypeError`, as in
  Finding.

Rejected:

- `unist-util-select`. Following is async, and it matches the tree as
  written.
- `:key(director)`. It's longer for the selector used most.
- Not walking under a reference back to a node being walked, as visits do.
  A selector's partial matches differ by path, so it would miss matches.
- Comparing unquoted values as JSON. Keys and `jsonType` are strings, so
  common selectors would need quotes.
- `:has()`, for now. It follows references under a node even for
  `jrefSelect`.
- Sibling combinators and `:nth-child()`. Object members aren't ordered,
  and array items are reached by `[key=...]`.
- Narrowing by `type`, for now. A `type` is a media type's, and `jsonType`
  is known for every media type.
- Parsing the whole selector in the types. It's slow to check, and other
  properties don't say what kind of value a node is.

## Known limitations

- `:not()` and the attribute operators `^=`, `$=`, and `*=` aren't
  supported yet. They could be added without changing what's supported.
