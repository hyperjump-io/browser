# The JSON AST (`src/json/`, `src/jref/`)

Documents are unist-compatible ASTs with positions, so they work with
unified, and editors can find the node at the cursor.

## Parsing

The parser is a hand-written scanner and recursive descent parser, ported
from `json-language-server`. Parsing never
throws. `fromJson` and `fromJref` always build an AST and return it as
the root of a document, whose parse status is one of:

- `success`: the input is valid
- `recovered`: every syntax error was resolved by interpreting the intent,
  such as a trailing comma or an unclosed bracket
- `failure`: some value is invalid or missing, a property name is missing,
  or input had to be discarded. For JRef, a `$ref` that isn't a valid
  reference is a failure too (see [Transforming](#transforming)).

- Only a failure can contain `json-invalid` and `json-missing` nodes.
  `JsonNode` takes a type parameter for those nodes, which defaults to
  `never`, so complete trees are typed as before. `hasStatus` narrows a
  document by its status.
- Syntax errors are plain objects in `errors`, with specific `ruleId`s and
  positions. `jsonSyntaxErrorMessage` describes one. They become
  `VFileMessage`s where they're reported or thrown, by the unified plugins
  (`rejsonParse`, `jrefParse`), whose `accept` option sets the worst
  status that doesn't fail the file. The media type plugins throw a
  `SyntaxError` instead (see [Media types](media-types.md)).
- While typing at the end of a truncated document, the cursor is usually in
  whitespace after the last token, so an unclosed container extends to
  where parsing stopped, as it does in `json-language-server`. A property
  with no value extends the same way, so the cursor is inside it while
  typing the value. The missing value node stays zero width after the
  colon.
- `allowComments` supports JSONC. Comments are listed on the document node.
- Nesting is limited to 1000 levels instead of overflowing the stack.
  Recovery heuristics run in linear time regardless of the input.
- A number past a JavaScript number's range, like `1e999`, is
  `number-out-of-range`, a `json-invalid` node, so the parse is a failure.
  RFC 8259 allows a limit on a number's range. Its value would be
  `Infinity`, which isn't JSON, so no tree has a number that can't be
  written back, and `fromJs` throws a `TypeError` for a number that isn't
  finite. JSONTestSuite leaves these to the implementation (its `i_`
  files), and its overflow cases are `n_` here.
  - A number too small to be one, like `1e-999`, is 0, and a whole
    number past 2^53 loses precision, as in `JSON.parse`. Each is a JSON
    number, so it's written back as one.
  - `Infinity`, as `JSON.parse` has it, was rejected. `toJson` would
    write it as `null`, as `JSON.stringify` does, and a value would change
    without an error.
  - Writing it back as `1e999` was rejected too. A tree would have a
    number `fromJs` can't take, and `jsonValue` would give a value that
    isn't JSON.
- A duplicated property name fails `jsonStep`.

## Transforming

- The AST is the value an application transforms. It's changed after
  parsing and before stringifying, by a function of the tree or by a
  unified transformer plugin. The parser and `toJson` don't call code of
  the application's.
- `fromJref` is `fromJson` and then a pass over the tree that makes each
  object with a string `$ref` a reference. Compared to one pass with a
  reviver, the second pass costs up to 8% on documents with many
  references, and `fromJson` is up to 7% faster without a reviver (see
  [Reviver and second pass](../benchmarks/reviver-second-pass.md)).
  - A reviver and a replacer like `JSON.parse`'s and `JSON.stringify`'s
    were rejected. `JSON.parse` returns a plain value, so a hook is the
    only place to change it as it's built. An AST can be changed after.
    Typing a reviver means typing a fold from the leaves up, where each
    node's children are what the reviver returned for them, and nothing
    needs one except `fromJref`.
  - Keeping `fromJref` in one pass with a reviver that isn't exported was
    rejected because the second pass costs little.
- A string `$ref` that doesn't resolve to a URL against the document's URL
  with `URL.parse` (like `b` against `urn:example:a`) is an error: the object is a `JrefInvalidReferenceNode`
  (`type: "invalid-reference"`), which keeps its properties, and a
  `JrefSyntaxError` (`source: "jref"`, `ruleId: "invalid-reference"`) is
  merged into `errors` in document order. The status is `failure`, so the
  node is only in the tolerant types, and a `success` or `recovered` tree's
  references can all be followed. A `$ref` that isn't a string isn't a
  reference, so it's an ordinary object.
  - `jrefSyntaxErrorMessage` describes JRef's errors and JSON's, and
    `reportSyntaxErrors` takes the message function, so `json/` doesn't
    know JRef's messages.
- A `$ref` that's a `file:` URL by itself, like `file:///home/me/a.json`,
  is an error too (`ruleId: "absolute-file-reference"`), and its object is
  an invalid reference. A document with one says where files are on the
  machine it was written on, just by being shared, and it only works
  there. A file is referred to with a relative reference, from a file, so
  nothing that should work is refused. The message doesn't say the URL.
- An object with more than one `$ref` is an invalid reference too
  (`ruleId: "duplicate-reference"`), whatever their values are, with the
  error at the second `$ref`'s name. It's ambiguous: `JSON.parse` keeps
  the last one, and another reader could take the first, so two readers
  of a document could disagree about where it refers, or whether it's a
  reference at all. RFC 6901 fails a pointer to a name that's there more
  than once for the same reason, and so does `jsonStep`. The error has no
  `actual`, since it isn't about one value.
  - The first string `$ref` winning was rejected, and so was the last
    winning, as `JSON.parse` does. Either one reads the document without
    saying it's ambiguous.
  - An annotation that isn't an error, with the document's status still
    `success`, was rejected. A session could use the rest of the document,
    but every complete tree could have references that can't be followed,
    and everything that switches on a node's type would handle one more.
  - A `reference` with an optional `href` was rejected for the same
    reasons, and it's easier to miss: code that only reads `href` doesn't
    have to check it.
  - `"invalid-reference"` as a `JsonSyntaxErrorCode` was rejected. The JSON
    parser never makes it, so code that handles every code of `fromJson`'s
    errors would handle one that can't happen, and its `source` would say
    `json`.
  - Either one could come back as an option of `fromJson`, `fromJref`, or
    `toJson`, without breaking their signatures. A reviver runs during a
    parse and can start another, so the parser would have to keep no state
    between parses.

## Nodes

- Property nodes have positions, and a type parameter for annotations, so
  an application can annotate them. The utilities are generic over the
  node type, so they work with annotated trees.
- A node's annotations (`JsonNode<A, X, P>`) say what it is in its media
  type, like a JRef `reference` and its `href`. What an application learns
  about a node that isn't what it is goes in unist's `data`.
  - Annotations kept apart from the tree, in a map by `location`, were
    rejected. Nothing could tell a reference without the map, so every
    traversal would need it. A type check like `type === "reference"`
    wouldn't narrow to the annotations it has, so every use would handle a
    missing one. Property nodes don't have a location
    to be found by.
- Functions that only read a JavaScript value take `ReadonlyJson`
  (`fromJs`), so a value declared `as const` can be passed. What they
  return is `Json`, because it's a new value the caller owns.
- Object and array utilities present missing values as `undefined`.
- `jsonArrayIter`, `jsonObjectKeys`, `jsonObjectValues`, and
  `jsonObjectEntries` return `@hyperjump/pact`'s iterators, a `map` over
  the node's children, so they're iterable and have the helpers an engine
  gives iterators. Once one is done, it stays done.
  - Generators were rejected. They show up when profiling code that
    iterates with them, and reading a document's members is most of what
    browsing does.
  - An iterator class of this package's was rejected. It was what pact's
    `map` already is.
  `jsonValue` supports arrays and objects: values that couldn't be parsed
  are left out of objects and are `null` in arrays, as `toJson` does.
- `jsonValue` makes an object's properties the way `JSON.parse` does, as
  own properties. Assigning them would make a `"__proto__"` key the
  object's prototype, so a document could choose what any property it
  doesn't have reads as.
- `jsonValue`'s return type is the value of the node's `jsonType`
  (`JsonTypeValue`), so a node narrowed to several types, like a string or
  a boolean, has a value of one of theirs.
  - An overload for each `jsonType` was rejected. It only types a node
    narrowed to one, and every other node falls back to `Json`.
- `jsonValue` takes a property's name node too, and its value is the name.
  It's a string node without a `location`, because a name isn't a value a
  pointer can identify.

## Locations

- A node's location is its document's URL with a fragment that's a JSON
  Pointer. Pointer segments are percent-encoded with what the URL Standard
  encodes in a fragment, and `%`, so a pointer with a `%` decodes to
  itself (`appendToLocation`). A location is its own `href`, so it's a
  URL like any other and isn't parsed again (see
  [Identifiers are URLs](../principles/identifiers-are-urls.md)). A
  document's URL comes from outside, so `fromJson` and `fromJref` parse
  it, and one with a fragment throws, because its locations would have two.
  `fromJs` parses its root's location, and one without a fragment is a
  document's, whose root is `#`. The recursion inside `fromJs` doesn't
  parse again.
- Every document has a URL. `fromJson` and `fromJref` are given it, so a
  relative reference always has something to resolve against. A message
  says a `file:` URL relative to the working directory (see
  [Local paths in errors](file-urls.md)).
- The unified parse plugins make a document's URL from the file's `path`
  and `cwd` (`#path-to-url`, which has a version for browsers), and the
  document node has it as `url`. A file without a `path`, like text from
  stdin, gets it from the `url` option of `rejsonParse` and `jrefParse`. A
  file with neither fails the parse with a message, because its document
  would have no URL (`file-url.js`).
  - A file with a `path` and a `url` fails too. They'd be two places to say
    where the document is, which could disagree.
  - A `location` option that replaced the file's path was rejected for the
    same reason.
  - Making up a URL for a file without a path was rejected. Its relative
    references would resolve against a URL that nothing said the document
    has.
- `fromJson` and `fromJref` return `{ document, errors }`: the document,
  with the AST as its root, its URL, its comments, and for JRef its
  `anchors`, and the syntax errors next to it. It's what
  `fromMarkdown` from `mdast-util-from-markdown` does, which returns the
  root and not the first node in it. The document's `url` is the one the
  parse makes from what it's given, which its nodes' locations start with.
  The JSON and JRef media types and the unified parse plugins make their
  documents with them, so a document is the same wherever it's parsed, and
  code that has text parses one without a media type or unified.
  - A document can have any parse status, like a tree from unified's
    `parse`. A media type throws for one that isn't a `success`, and a
    parse plugin reports its errors on the file.
  - `fromJref`'s document has `anchors`, so a document parsed outside a
    session says what its fragments identify and is read as it is (see
    [Documents](documents.md)).
  - Rejected: a result with the root `node`, its `status`, and its
    `comments`, typed by its status. The status and comments are the
    document's, so the four places that make a document each built one
    from it by hand, and nothing gave code that has text a document to
    read with the `jref*` functions.
  - Rejected: a second pair of functions that return a document, next to
    ones that return the root. They'd be two ways to parse the same text.
  - Rejected: parsing with a media type's `parse`, given a source made by
    hand. A media type is how a session picks the parser for a response,
    and its `parse` throws for a syntax error.
- `appendToLocation` caches the encoded form of each segment, because
  encoding was most of the time `fromJs` took (see
  [Node locations](../benchmarks/node-locations.md)).
