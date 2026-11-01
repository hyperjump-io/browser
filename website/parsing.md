# Parse JSON and JRef

You can use the JSON and JRef parsers on their own without a `Hyperjump`. They
parse into a JSON abstract syntax tree (AST), which is a
[unist](https://github.com/syntax-tree/unist) tree with a position for every
value.

## Parse

`fromJson` parses JSON text. It never throws. Instead, it recovers from syntax
errors where it can and returns every error it found:

```typescript
import { fromJson, jsonSyntaxErrorMessage } from "@hyperjump/browser";

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
| `"recovered"` | There were syntax errors, but the parser could tell what the text meant. A trailing comma is an example. The AST has every value. |
| `"failure"` | The parser couldn't parse some values because of syntax errors. The AST has error nodes where those values would be. |

Each error is plain data with a `ruleId` and a `place`. The `ruleId` is a name
such as `"trailing-comma"`. To turn an error into a message for people to read,
use `jsonSyntaxErrorMessage`.

The second argument of `fromJson` is the document's base URI. With the
`allowComments` option, `fromJson` accepts `//` and `/* */` comments the way
JSON with Comments (JSONC) does. Comments aren't part of the AST. The result
lists them in `comments` in the order they appear:

```typescript
const json = `{ "a": 1 // one
}`;
const result = fromJson(json, "https://example.com/doc", {
  allowComments: true
});

result.node.location; // "https://example.com/doc#"
result.comments[0].value; // " one"
```

`fromJref` parses JRef the same way. If you also pass the document's URI, each
reference node gets an `href`, which is the reference's URI resolved against the
document:

```typescript
import { fromJref } from "@hyperjump/browser";

const jref = `{ "x": { "$ref": "#/y" }, "y": 1 }`;
const { node } = fromJref(jref, "https://example.com/doc");
```

Without a URI, `href` is the reference as written. `fromJref` takes the
`allowComments` option too.

## Read the AST

Each node has a `jsonType`, a `location`, and a `position`. The `location` is a
URL with a JSON Pointer to the node. The `position` says where the node is in
the text.

To read values out of the AST, use the JSON AST functions. This example gets a
node with a JSON Pointer and then reads the node's value and its position:

```typescript
import {
  fromJson,
  jsonSyntaxErrorMessage,
  jsonValue,
  jsonPointerGet
} from "@hyperjump/browser";

const result = fromJson(`{ "a": { "b": [10, 20] } }`);
if (result.status === "failure") {
  throw Error(jsonSyntaxErrorMessage(result.errors[0]));
}

const twenty = jsonPointerGet("/a/b/1", result.node);
jsonValue(twenty); // 20
twenty.position?.start; // { line: 1, column: 20, offset: 19 }
```

The example checks the `status` first because only a parse whose status is
`"failure"` can have error nodes. After that check, TypeScript knows that the
AST has none.

These are the functions for reading the AST:

| Function | Description |
| --- | --- |
| `jsonPointerGet(pointer, node)` | The node a JSON Pointer points to |
| `jsonStep(key, node)` | A property or item of a node |
| `jsonValue(node)` | The node's value as JavaScript |
| `jsonObjectHas`, `jsonObjectKeys`, `jsonObjectValues`, `jsonObjectEntries`, `jsonArrayIter` | Read objects and arrays |
| `toJson(node, options)` | The node as JSON text. The `space` option indents it like the `space` of `JSON.stringify`. |
| `fromJs(value)` | An AST from a JavaScript value |

None of these follow references. To follow references, use the `jref`
functions with a [session](browsing.md).

`jsonPointerGet` and `jsonStep` throw a `JsonPointerError` when a property or
item doesn't exist. Its message says the location that the pointer couldn't
reach. That location comes from the node's `location`, so it starts with the
base URI you gave `fromJson` or `fromJs`.

In an AST from a parse whose status is `"failure"`, a value that the parser
couldn't parse is `undefined`. The root itself can be an error node, so check
that its `type` is `"json"` first:

```typescript
import { fromJson, JsonPointerError, jsonPointerGet } from "@hyperjump/browser";

const { node } = fromJson(`{ "a": }`, "https://example.com/doc");
if (node.type === "json") {
  jsonPointerGet("/a", node); // undefined

  try {
    jsonPointerGet("/b", node);
  } catch (error) {
    if (error instanceof JsonPointerError) {
      error.message;
      // "Property 'b' doesn't exist at https://example.com/doc#/b"
    }
  }
}
```

`jsonValue` and `toJson` leave such a value out of an object. In an array, they
make it `null` so the items after it keep their positions.

## Build nodes

If you build nodes of your own, use `appendToLocation` to give them a
`location`. It adds a property name or array index to the JSON Pointer of the
parent's `location`. It encodes and normalizes the result the way the parser
does, so you can compare it to the locations the parser made:

```typescript
import { appendToLocation } from "@hyperjump/browser";

appendToLocation("a b", "https://example.com/doc#/x");
// "https://example.com/doc#/x/a%20b"
```

## In a unified pipeline

`rejsonParse` and `rejsonStringify` are plugins for
[unified](https://unifiedjs.com/) pipelines that process JSON files. `jrefParse` and `jrefStringify`
do the same for JRef. With `accept: "recovered"`, the pipeline still processes a
file when the parser recovers from its syntax errors and reports those errors as
warnings.

The parse plugins take the `allowComments` option, which works as it does for
`fromJson`. `rejsonParse` also takes a `location`, which is the document's base
URI. The stringify plugins take the `space` option of `toJson`. To change the
AST in a pipeline, use a transformer plugin between the parse and stringify
plugins.

The parse plugins produce a document node whose `status` says how parsing went.
Use `hasStatus` to check it. Unlike checking `status` directly, `hasStatus`
narrows the document's type in TypeScript. TypeScript then knows that a
document with the status `"success"` or `"recovered"` has no error nodes:

```typescript
import { hasStatus } from "@hyperjump/browser";

if (hasStatus(document, "success", "recovered")) {
  // document.children has no error nodes
}
```

`hasStatus` works for JRef documents too.
[`@hyperjump/json-schema`](https://github.com/hyperjump-io/json-schema/blob/v2/website/unified/README.md)
uses these plugins to validate and lint JSON files.
