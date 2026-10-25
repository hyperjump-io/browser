# Parsing JSON and JRef

`@hyperjump/browser/json` and `@hyperjump/browser/jref` have the parsers the
browser uses, for use on their own. They parse into a JSON AST, a
[unist](https://github.com/syntax-tree/unist) tree with a position for
every value.

## Parsing

`fromJson` parses JSON text. It never throws. It recovers from syntax errors
where it can, and returns every error it found.

```javascript
import { fromJson, jsonSyntaxErrorMessage } from "@hyperjump/browser/json";

const result = fromJson(`{ "a": [1, 2,] }`);
result.status; // "recovered"
result.errors.map(jsonSyntaxErrorMessage); // ["Trailing commas are not allowed"]
result.node; // The AST
```

| `status` | Meaning |
| --- | --- |
| `"success"` | No syntax errors |
| `"recovered"` | Syntax errors, but the parser could tell what was meant, like a trailing comma. The AST has every value. |
| `"failure"` | Syntax errors where a value couldn't be parsed. The AST has error nodes where those values would be. |

Each error is plain data, with a `ruleId` like `"trailing-comma"` and a
`place`. `jsonSyntaxErrorMessage` describes it.

`fromJref` parses JRef the same way. Pass the document's URI, and each
reference node gets an `href`, its URI resolved against the document.

```javascript
import { fromJref } from "@hyperjump/browser/jref";

const { node } = fromJref(`{ "x": { "$ref": "#/y" }, "y": 1 }`, "https://example.com/doc");
```

## Reading the AST

Each node has a `jsonType`, a `location` (a URI with a JSON Pointer to it),
and a `position` in the text.

```javascript
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

`rejsonParse` and `rejsonStringify` (and `jrefParse` and `jrefStringify`)
are [unified](https://unifiedjs.com/) plugins, for pipelines that process
JSON files. With `accept: "recovered"`, a file with syntax errors the parser
recovered from is processed, and its errors are reported as warnings.
[`@hyperjump/json-schema`](https://github.com/hyperjump-io/json-schema/blob/v2/website/unified/README.md)
uses them to validate and lint JSON files.
