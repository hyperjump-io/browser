# The JSON AST (`src/json/`, `src/jref/`)

Documents are unist ASTs with positions, so they work with unified, and
editors can find the node at the cursor.

## Parsing

The parser is a hand-written recursive descent parser, ported from
`json-language-server`, and it never throws (see
[Parsing never fails](../principles/parsing-never-fails.md)). A
document's status is `success`, `recovered` (every error was resolved by
reading the intent, like a trailing comma), or `failure`.

- Only a failure has `json-invalid` and `json-missing` nodes. `JsonNode`'s
  type parameter for them defaults to `never`, and `hasStatus` narrows by
  status.
- Syntax errors are plain objects in `errors`. The unified plugins make
  them `VFileMessage`s, with an `accept` option for the worst status that
  passes. The media type plugins throw (see [Media types](media-types.md)).
- An unclosed container, or a property with no value, extends to where
  parsing stopped, so the cursor is inside it while typing at the end, as
  in `json-language-server`.
- `allowComments` supports JSONC. Nesting is limited to 1000 levels, and
  recovery runs in linear time.
- A byte order mark is `byte-order-mark`, and the status is `recovered`.
  `readFile` and a `VFile` leave one in the text, and RFC 8259 lets a parser
  ignore it.
  - `success` was rejected, because `JSON.parse` fails on it and an editor
    should say so. Failing was rejected, because the tree has everything.
- A number past a JavaScript number's range, like `1e999`, is
  `number-out-of-range`, a failure, so no tree has a number that can't be
  written back. A number too small, like `1e-999`, is 0, and a whole
  number past 2^53 loses precision, as in `JSON.parse`. Each is still a
  JSON number.
  - `Infinity`, as `JSON.parse` has it, was rejected. `toJson` would write
    `null` without an error. Writing back `1e999` was rejected too, since
    `jsonValue` would give a value that isn't JSON.
- Points are found in document order. A container's or a property's start
  point is found where it starts, not when it ends. Finding one backward
  searched the line starts and lost the line the parser was on, which was a
  quarter of parsing a document of many lines.
- Lines are found going forward from the last point's line. A table of
  every line's start is made only for a point behind it, like an error's
  after parsing, or for text with a `\r`. With a container making only the
  array of its kind of children, it made parsing a document of many lines
  18% faster.
- Garbage collection is a third of parsing, since every node survives, so
  nothing is built on the way to a node: a scalar isn't an object of its
  type and value, a property returns only its node, the comma after an item
  is variables, not an object, and a container makes only the array of its
  kind of children.
- The scanner writes each token into one of the parser's two tokens, the
  current one and the one looking ahead, instead of making an object for
  it. It made parsing 3–13% faster.
- A second parser for valid JSON, tried first with the tolerant one as the
  fallback, was rejected. It made a valid document 24–38% faster, but one
  with an error near its end, as while typing at the end, took twice as
  long, and the two parsers would have to make the same tree.
- The scanner finds a token like `{` or `,` by its character code in an
  array. An object with keys like those is a dictionary, and scanning took
  twice as long.

## Transforming

- The AST is what an application transforms, after parsing and before
  stringifying. The parser and `toJson` don't call the application's code.
  - A reviver and a replacer, like `JSON.parse`'s, were rejected. They're
    for values that can't be changed after they're built, and typing a
    reviver means typing a fold.
- `fromJref` makes each object with a string `$ref` a reference as the
  parser makes the object. The parser tells it of each one, inner ones
  first, and doesn't use what it returns, so it's an event and not a
  reviver, and it isn't exported. `fromJref` takes about as long as
  `fromJson`, and the event costs `fromJson` nothing measurable.
  - A second pass over the tree was rejected. It cost 4–11%, mostly
    reading the tree again after it's left the CPU's cache.
  - A private reviver was rejected. It's a fold, and calling it at every
    node made `fromJson` up to 7% slower.
- A `$ref` that doesn't resolve with `URL.parse`, like `b` against
  `urn:example:a`, makes its object an `invalid-reference`, with a
  `JrefSyntaxError`, and the status `failure`. So every reference in a
  `success` or `recovered` tree can be followed.
- A `$ref` that's an absolute `file:` URL is an `absolute-file-reference`
  (see [`file:` from `file:`](file-references.md#absolute-file-urls)).
- An object with more than one `$ref` is a `duplicate-reference`. Two
  readers could disagree about where it refers, which is why RFC 6901 and
  `jsonStep` fail on a duplicated name too.
  - The first or last `$ref` winning was rejected. Either one reads an
    ambiguous document without saying so.
  - An annotation that isn't an error, or a `reference` with an optional
    `href`, was rejected. Every complete tree could have references that
    can't be followed.
  - `"invalid-reference"` as a `JsonSyntaxErrorCode` was rejected. The
    JSON parser never makes it.

## Nodes

- Property nodes have positions and a type parameter for annotations, and
  the utilities are generic over it. A node's annotations say what it is
  in its media type, like a reference's `href`. What an application learns
  about a node goes in unist's `data`.
  - Annotations in a map by `location` were rejected. Every traversal would
    need the map, and `type === "reference"` wouldn't narrow.
- `jsonValue` makes properties as own properties, like `JSON.parse`, so a
  `"__proto__"` key can't set the prototype. Its return type is the value
  of the node's `jsonType`.
  - An overload for each `jsonType` was rejected. It only types a node
    narrowed to one.
- The iterators are `@hyperjump/pact`'s, a `map` over the children.
  - Generators were rejected. They show up when profiling, and reading
    members is most of what browsing does.
- Nodes share points where their positions meet. A property starts at its
  name's start point and ends at its value's end point, and an empty
  position starts and ends at one point. It made parsing 3–7% faster. A
  transformer that changes a point in place changes every position that
  has it, so one that moves a node gives it a new position.
  - Freezing the tree was rejected. It's what an application transforms,
    and freezing cost a quarter of parsing or more, even for only the
    positions as they're made.

## Locations

- A node's location is its document's URL with a JSON Pointer fragment,
  percent-encoded with what the URL Standard encodes in a fragment, and
  `%`. It's an `href` (see
  [Identifiers are URLs](../principles/identifiers-are-urls.md)).
  `appendToLocation` caches each segment's encoded form and doesn't encode
  array indexes. Encoding was most of what `fromJs` took, and the cache
  made it two to three times faster.
  - Skipping the cache for a name that encodes to itself was rejected.
    Checking the name took as long as looking it up.
- `fromJson` and `fromJref` are given the document's URL and parse it. One
  with a fragment throws, because its locations would have two.
- The unified plugins make the URL from the file's `path` and `cwd`, or
  from the `url` option for a file without a path. A file with neither, or
  with both, fails the parse.
  - Making up a URL was rejected. Relative references would resolve
    against a URL nothing said the document has.
- `fromJson` and `fromJref` return `{ document, errors }`, like
  `mdast-util-from-markdown`'s `fromMarkdown`, and media types and the
  unified plugins make documents with them, so a document is the same
  wherever it's parsed.
  - A result of the root, status, and comments was rejected. Everything
    that made a document built one from it by hand.
  - Parsing with a media type's `parse` was rejected. It's how a session
    picks a parser, and it throws for a syntax error.

## Known limitations

- A name with a lone surrogate has a location that doesn't lead back to
  it, because a URL makes it U+FFFD. A syntax error, or reading it as
  U+FFFD, was rejected, because either changes what `JSON.parse` reads.
- Node.js 26.3.1 resolves `x#a` against `urn:example:a`, which the URL
  Standard doesn't, so there that `$ref` is a reference. It's the
  platform's, so it isn't worked around.
