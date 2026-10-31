# Parsing JSON and JRef

You can use the JSON and JRef parsers on their own, without a `Hyperjump`.
Import them from `@hyperjump/browser/json` and `@hyperjump/browser/jref`. They
parse into a JSON AST, which is a [unist](https://github.com/syntax-tree/unist)
tree with a position for every value.

## Parsing

`fromJson` parses JSON text. It never throws. Instead, it recovers from syntax
errors where it can and returns every error it found:

```typescript
import { fromJson, jsonSyntaxErrorMessage } from "@hyperjump/browser/json";

const result = fromJson(`{ "a": [1, 2,] }`);
result.status; // "recovered"
result.node; // The AST

const [error] = result.errors;
error.ruleId; // "trailing-comma"
jsonSyntaxErrorMessage(error); // "Trailing commas are not allowed"
```

The `status` says how parsing went:

| Status | Meaning |
| --- | --- |
| `"success"` | No syntax errors |
| `"recovered"` | There were syntax errors, but the parser could tell what was meant. A trailing comma is an example. The AST has every value. |
| `"failure"` | Some values couldn't be parsed because of syntax errors. The AST has error nodes where those values would be. |

Each error is plain data with a `ruleId` and a `place`. The `ruleId` is a name
like `"trailing-comma"`. To turn an error into a message for people to read,
use `jsonSyntaxErrorMessage`.

`fromJref` parses JRef the same way. If you also pass the document's URI, each
reference node gets an `href`, which is the reference's URI resolved against the
document:

```typescript
import { fromJref } from "@hyperjump/browser/jref";

const jref = `{ "x": { "$ref": "#/y" }, "y": 1 }`;
const { node } = fromJref(jref, "https://example.com/doc");
```

## Reading the AST

Each node has a `jsonType`, a `location`, and a `position`. The `location` is a
URL with a JSON Pointer to the node. The `position` says where the node is in
the text.

To read values out of the AST, use the functions that `@hyperjump/browser/json`
exports. This example gets a node with a JSON Pointer, then reads the node's
value and its position:

```typescript
import { fromJson, jsonValue, pointerGet } from "@hyperjump/browser/json";

const { node } = fromJson(`{ "a": { "b": [10, 20] } }`);
const twenty = pointerGet("/a/b/1", node);

jsonValue(twenty); // 20
twenty.position.start; // { line: 1, column: 20, offset: 19 }
```

These are the functions for reading the AST:

| Function | What it does |
| --- | --- |
| `pointerGet(pointer, node)` | The node a JSON Pointer points to |
| `pointerStep(key, node)` | A property or item of a node |
| `jsonValue(node)` | The node's value as JavaScript |
| `jsonObjectHas`, `jsonObjectKeys`, `jsonObjectValues`, `jsonObjectEntries`, `jsonArrayIter` | Read objects and arrays |
| `toJson(node, replacer, space)` | The node as JSON text, like `JSON.stringify` |
| `fromJs(value)` | An AST from a JavaScript value |

None of these follow references. To follow references, use a
[session](browsing.md).

## In a unified pipeline

`rejsonParse` and `rejsonStringify` are [unified](https://unifiedjs.com/)
plugins for pipelines that process JSON files. `jrefParse` and `jrefStringify`
do the same for JRef. With `accept: "recovered"`, a file is still processed when
the parser recovers from its syntax errors. Those errors are reported as
warnings.
[`@hyperjump/json-schema`](https://github.com/hyperjump-io/json-schema/blob/v2/website/unified/README.md)
uses these plugins to validate and lint JSON files.
