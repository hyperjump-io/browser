# The JSON AST (`src/json/`)

Documents are unist-compatible ASTs with positions, so they work with
unified, and editors can find the node at the cursor.

## Parsing

The parser is a hand-written scanner and recursive descent parser, ported
from json-language-server. It replaced a moo-based one. Parsing never
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
  where parsing stopped, as it does in json-language-server. A property
  with no value extends the same way, so the cursor is inside it while
  typing the value. The missing value node stays zero width after the
  colon.
- `allowComments` supports JSONC. Comments are listed on the document node
  and in parse results.
- Nesting is limited to 1000 levels instead of overflowing the stack.
  Recovery heuristics run in linear time regardless of the input.
- A duplicated property name fails `pointerStep`.

## Nodes

- Property nodes have positions, and a type parameter for annotations, so
  an application can annotate them. The utilities are generic over the
  node type, so they work with annotated trees.
- Functions that only read a JavaScript value take `ReadonlyJson`
  (`fromJs`), so a value declared `as const` can be passed. What they
  return is `Json`, because it's a new value the caller owns.
- Object and array utilities present missing values as `undefined`.
  `jsonValue` supports arrays and objects: values that couldn't be parsed
  are left out of objects and are `null` in arrays, as `toJson` does.
  `Session.value` still throws for arrays and objects, because it would
  need to follow the references in them.

## Locations

- A node's location is a URI whose fragment is a JSON Pointer. Pointer
  segments are percent-encoded where a fragment requires it
  (`appendToLocation`, `@hyperjump/uri`'s `encodeIriFragment`), so
  locations are valid, normalized IRIs. `get` decodes a fragment before
  following it as a JSON Pointer.
- `appendToLocation` caches the encoded form of each segment, because
  encoding was most of the time `fromJs` took (see
  [Node locations](../benchmarks/node-locations.md)).
