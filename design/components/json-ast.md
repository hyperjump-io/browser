# The JSON AST (`src/json/`)

Documents are unist-compatible ASTs with positions, so they work with
unified, and editors can find the node at the cursor.

## Parsing

The parser is a hand-written scanner and recursive descent parser, ported
from `json-language-server`. Parsing never
throws. `fromJson` and `fromJref` always build an AST and return a parse
status with it:

- `success`: the input is valid
- `recovered`: every syntax error was resolved by interpreting the intent,
  such as a trailing comma or an unclosed bracket
- `failure`: some value is invalid or missing, a property name is missing,
  or input had to be discarded

- The result's type discriminates on the status, so only a failure can
  contain `json-invalid` and `json-missing` nodes. `JsonNode` takes a type
  parameter for those nodes, which defaults to `never`, so complete trees
  are typed as before. `hasStatus` narrows document nodes by status.
- Syntax errors are plain objects in `errors`, with specific `ruleId`s and
  positions. `jsonSyntaxErrorMessage` describes one. They become
  `VFileMessage`s where they're reported or thrown, by the unified plugins
  (`rejsonParse`, `jrefParse`), whose `accept` option sets the worst
  status that doesn't fail the file.
- While typing at the end of a truncated document, the cursor is usually in
  whitespace after the last token, so an unclosed container extends to
  where parsing stopped, as it does in `json-language-server`. A property
  with no value extends the same way, so the cursor is inside it while
  typing the value. The missing value node stays zero width after the
  colon.
- `allowComments` supports JSONC. Comments are listed on the document node
  and in parse results.
- Nesting is limited to 1000 levels instead of overflowing the stack.
  Recovery heuristics run in linear time regardless of the input.
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
  - Either one could come back as an option of `fromJson`, `fromJref`, or
    `toJson`, without breaking their signatures. A reviver runs during a
    parse and can start another, so the parser would have to keep no state
    between parses.

## Nodes

- Property nodes have positions, and a type parameter for annotations, so
  an application can annotate them. The utilities are generic over the
  node type, so they work with annotated trees.
- A node's annotations (`JsonNode<A, X, P>`) say what it is in its media
  type, like a JRef `reference` and its `href`, which a session follows,
  or a JSON Schema keyword's `keywordUri`. What an application learns
  about a node that isn't what it is, like validation results, goes in
  unist's `data`.
  - Annotations kept apart from the tree, in a map by `location`, were
    rejected. A session couldn't tell a reference without the map, so
    every traversal would need it. A type check like `type ===
    "json-schema"` wouldn't narrow to the annotations it has, so every
    use would handle a missing one. Property nodes don't have a location
    to be found by.
- Functions that only read a JavaScript value take `ReadonlyJson`
  (`fromJs`), so a value declared `as const` can be passed. What they
  return is `Json`, because it's a new value the caller owns.
- Object and array utilities present missing values as `undefined`.
  `jsonValue` supports arrays and objects: values that couldn't be parsed
  are left out of objects and are `null` in arrays, as `toJson` does.
  `Session.value` still throws for arrays and objects, because it would
  need to follow the references in them.
- `jsonValue` makes an object's properties the way `JSON.parse` does, as
  own properties. Assigning them would make a `"__proto__"` key the
  object's prototype, so a document could choose what any property it
  doesn't have reads as.

## Locations

- A node's location is a URI whose fragment is a JSON Pointer. Pointer
  segments are percent-encoded where a fragment requires it
  (`appendToLocation`, `@hyperjump/uri`'s `encodeIriFragment`), so
  locations are valid, normalized IRIs. `get` decodes a fragment before
  following it as a JSON Pointer.
- `appendToLocation` caches the encoded form of each segment, because
  encoding was most of the time `fromJs` took (see
  [Node locations](../benchmarks/node-locations.md)).
