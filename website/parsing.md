# Parsing JSON and JRef

`@hyperjump/browser/json` and `@hyperjump/browser/jref` export the parsers
the browser uses so you can use them on their own. They parse into a JSON
AST. The AST is a [unist](https://github.com/syntax-tree/unist) tree with a
position for every value.

## Parsing

`fromJson` parses JSON text. It never throws. It recovers from syntax errors
where it can and returns every error it found.

```typescript
import { fromJson, jsonSyntaxErrorMessage } from "@hyperjump/browser/json";

const result = fromJson(`{ "a": [1, 2,] }`);
result.status; // "recovered"
result.node; // The AST

const [error] = result.errors;
error.ruleId; // "trailing-comma"
jsonSyntaxErrorMessage(error); // "Trailing commas are not allowed"
```

| Status | Meaning |
| --- | --- |
| `"success"` | No syntax errors |
| `"recovered"` | There were syntax errors, but the parser could tell what was meant. A trailing comma is an example. The AST has every value. |
| `"failure"` | Some values couldn't be parsed because of syntax errors. The AST has error nodes where those values would be. |

Each error is plain data with a `ruleId` like `"trailing-comma"` and a
`place`. `jsonSyntaxErrorMessage` turns an error into a message.

`fromJref` parses JRef the same way. If you pass the document's URI, each
reference node gets an `href`. That's the reference's URI resolved against
the document.

```typescript
import { fromJref } from "@hyperjump/browser/jref";

const jref = `{ "x": { "$ref": "#/y" }, "y": 1 }`;
const { node } = fromJref(jref, "https://example.com/doc");
```

## Reading the AST

Each node has a `jsonType`, a `location`, and a `position` in the text. The
`location` is a URI with a JSON Pointer to the node.

```typescript
import { fromJson, jsonValue, pointerGet } from "@hyperjump/browser/json";

const { node } = fromJson(`{ "a": { "b": [10, 20] } }`);
const twenty = pointerGet("/a/b/1", node);

jsonValue(twenty); // 20
twenty.position.start; // { line: 1, column: 20, offset: 19 }
```

| Function | What it does |
| --- | --- |
| `pointerGet(pointer, node)` | The node a JSON Pointer points to |
| `pointerStep(key, node)` | A property or item of a node |
| `jsonValue(node)` | The node's value as JavaScript |
| `jsonObjectHas`, `jsonObjectKeys`, `jsonObjectValues`, `jsonObjectEntries`, `jsonArrayIter` | Read objects and arrays |
| `toJson(node, replacer, space)` | The node as JSON text, like `JSON.stringify` |
| `fromJs(value)` | An AST from a JavaScript value |

These don't follow references. For that, use a [session](browsing.md).

## In a unified pipeline

`rejsonParse` and `rejsonStringify` are [unified](https://unifiedjs.com/)
plugins for pipelines that process JSON files. `jrefParse` and
`jrefStringify` do the same for JRef. With `accept: "recovered"`, a file is
still processed if the parser recovered from its syntax errors. Those
errors are reported as warnings.
[`@hyperjump/json-schema`](https://github.com/hyperjump-io/json-schema/blob/v2/website/unified/README.md)
uses them to validate and lint JSON files.
