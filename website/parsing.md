# Parsing JSON and JRef

You can use the JSON and JRef parsers on their own without a `Hyperjump`.
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

The second argument of `fromJson` is the document's base URI. With the
`allowComments` option, `fromJson` accepts `//` and `/* */` comments as JSONC
does. Comments aren't part of the AST. The result lists them in `comments` in
the order they appear:

```typescript
const json = `{ "a": 1 // one
}`;
const result = fromJson(json, "https://example.com/doc", undefined, {
  allowComments: true
});

result.node.location; // "https://example.com/doc#"
result.comments[0].value; // " one"
```

`fromJref` parses JRef the same way. If you also pass the document's URI, each
reference node gets an `href`, which is the reference's URI resolved against the
document:

```typescript
import { fromJref } from "@hyperjump/browser/jref";

const jref = `{ "x": { "$ref": "#/y" }, "y": 1 }`;
const { node } = fromJref(jref, "https://example.com/doc");
```

Without a URI, `href` is the reference as written. `fromJref` takes the
`allowComments` option too.

## Reviving nodes

The third argument of `fromJson` and `fromJref` is a reviver, which works like
the reviver of `JSON.parse` but on AST nodes. The parser calls it with each node
and the node's property name or array index from the leaves up to the root. The
node it returns takes the original node's place. If it returns `undefined`, the
value is left out:

```typescript
const reviver = (node, key) => key === "secret" ? undefined : node;
const { node } = fromJson(`{ "a": 1, "secret": 2 }`, "", reviver);

jsonValue(node); // { a: 1 }
```

The reviver isn't called for values that couldn't be parsed. In `fromJref`, a
reference node already has its `href` when the reviver gets it.

## Reading the AST

Each node has a `jsonType`, a `location`, and a `position`. The `location` is a
URL with a JSON Pointer to the node. The `position` says where the node is in
the text.

To read values out of the AST, use the functions that `@hyperjump/browser/json`
exports. This example gets a node with a JSON Pointer then reads the node's
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

`pointerGet` and `pointerStep` throw a `JsonPointerError` when a property or
item doesn't exist. Both take the document's base URI as an optional last
argument. In an AST from a parse whose status is `"failure"`, a value that
couldn't be parsed is `undefined`:

```typescript
import { JsonPointerError } from "@hyperjump/browser/json";

const { node } = fromJson(`{ "a": }`);
pointerGet("/a", node); // undefined

try {
  pointerGet("/b", node, "https://example.com/doc");
} catch (error) {
  error instanceof JsonPointerError; // true
  error.message; // "Property 'b' doesn't exist at https://example.com/doc#/b"
}
```

`jsonValue` and `toJson` leave such a value out of an object. In an array, they
make it `null`, so the items after it keep their positions.

## Building nodes

If you build nodes of your own, use `appendToLocation` to give them a
`location`. It adds a property name or array index to the JSON Pointer of the
parent's `location`. It encodes and normalizes the result the way the parser
does, so you can compare it to the locations the parser made:

```typescript
import { appendToLocation } from "@hyperjump/browser/json";

appendToLocation("a b", "https://example.com/doc#/x");
// "https://example.com/doc#/x/a%20b"
```

## In a unified pipeline

`rejsonParse` and `rejsonStringify` are [unified](https://unifiedjs.com/)
plugins for pipelines that process JSON files. `jrefParse` and `jrefStringify`
do the same for JRef. With `accept: "recovered"`, a file is still processed when
the parser recovers from its syntax errors. Those errors are reported as
warnings.

The parse plugins take the `allowComments` and `reviver` options, which work as
they do for `fromJson`. `rejsonParse` also takes a `location`, which is the
document's base URI. The stringify plugins take the `replacer` and `space`
options of `toJson`.

The parse plugins produce a document node whose `status` says how parsing went.
Use `hasStatus` to check it. Unlike checking `status` directly, `hasStatus`
narrows the document's type in TypeScript, so a document with the status
`"success"` or `"recovered"` is known to have no error nodes:

```typescript
import { hasStatus } from "@hyperjump/browser/json";

if (hasStatus(document, "success", "recovered")) {
  // document.children has no error nodes
}
```

`@hyperjump/browser/jref` exports a `hasStatus` that works for JRef documents
too.
[`@hyperjump/json-schema`](https://github.com/hyperjump-io/json-schema/blob/v2/website/unified/README.md)
uses these plugins to validate and lint JSON files.
