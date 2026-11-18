# Parse JSON and JRef

You can use the JSON and JRef parsers on their own, without a Hyperjump session.
They parse text into a document whose root is a JSON abstract syntax tree (AST)
of the value. The document is a [unist](https://github.com/syntax-tree/unist)
tree with a position for every value, and it's what the `jref` functions read.

## Parse

`fromJson` parses JSON text into a document. It never throws. Instead, it
recovers from syntax errors where it can and returns every error it found next
to the document:

```typescript
import { fromJson, jsonSyntaxErrorMessage } from "@hyperjump/browser";

const json = `{ "a": [1, 2,] }`;
const { document, errors } = fromJson(json, "https://example.com/doc");
document.status; // "recovered"
document.children[0]; // The AST of the value

const [error] = errors;
error.ruleId; // "trailing-comma"
jsonSyntaxErrorMessage(error); // "Trailing commas are not allowed"
```

The document's `status` says how parsing went:

| Status | Meaning |
| --- | --- |
| `"success"` | No syntax errors |
| `"recovered"` | There were syntax errors, but the parser could tell what the text meant. A trailing comma is an example. The AST has every value. |
| `"failure"` | The parser couldn't parse some values because of syntax errors. The AST has error nodes where those values would be. |

Each error is plain data with a `ruleId` and a `place`. The `ruleId` is a name
such as `"trailing-comma"`. To turn an error into a message for people to read,
use `jsonSyntaxErrorMessage`.

A number too big for JavaScript, such as `1e999`, is a `"number-out-of-range"`
error, so the parse fails. In `JSON.parse`, it would be `Infinity`, which JSON
can't represent.

The second argument of `fromJson` is the document's URL, which every node's
`location` starts with. It has to be an absolute URL without a fragment, or
`fromJson` throws a `TypeError`. With the
`allowComments` option, `fromJson` accepts `//` and `/* */` comments the way
JSON with Comments (JSONC) does. Comments aren't part of the AST. The document
lists them in `comments` in the order they appear:

```typescript
const json = `{ "a": 1 // one
}`;
const { document } = fromJson(json, "https://example.com/doc", {
  allowComments: true
});

document.url; // "https://example.com/doc"
document.children[0].location; // "https://example.com/doc#"
document.comments[0].value; // " one"
```

`fromJref` parses JRef the same way. Each reference node gets an `href`, which
is the reference resolved against the document's URL:

```typescript
import { fromJref } from "@hyperjump/browser";

const jref = `{ "x": { "$ref": "#/y" }, "y": 1 }`;
const { document } = fromJref(jref, "https://example.com/doc");
```

`fromJref` takes the `allowComments` option too.

A `$ref` whose value doesn't resolve to a URL against the document's URL isn't a
reference. `//[` is one, and so is `b` in a `urn:` document. Its object is an
error node with the `type` `"invalid-reference"`, the `status` is `"failure"`,
and the error's `ruleId` is `"invalid-reference"`. To turn the errors from
`fromJref` into messages, use `jrefSyntaxErrorMessage`, which describes JSON
syntax errors too:

```typescript
import { fromJref, jrefSyntaxErrorMessage } from "@hyperjump/browser";

const jref = `{ "$ref": "//[" }`;
const { document, errors } = fromJref(jref, "https://example.com/doc");
document.status; // "failure"
document.children[0].type; // "invalid-reference"
jrefSyntaxErrorMessage(errors[0]);
// "'//[' is not a valid reference"
```

A `$ref` that's an absolute `file:` URL, such as `file:///home/me/a.json`, isn't
a reference either, because it only works on one machine and says where that
machine's files are. To refer to a file from a file, use a relative reference.
Its error's `ruleId` is `"absolute-file-reference"`.

An object with more than one `$ref` isn't a reference either, because readers
of JSON don't agree on which one wins. Its error's `ruleId` is
`"duplicate-reference"`, and its `place` is the second `$ref`.

To follow the references in a document you parsed, pass it to the `jref`
functions. For more information, see
[Read a tree you parsed](references.md#read-a-tree-you-parsed).

## Read the AST

Each node has a `jsonType`, a `location`, and a `position`. The `location` is a
URL with a JSON Pointer to the node. The `position` says where the node is in
the text.

To read values out of the AST, use the JSON AST functions. This example gets a
node with a JSON Pointer and then reads the node's value and its position:

```typescript
import {
  fromJson,
  hasStatus,
  jsonSyntaxErrorMessage,
  jsonValue,
  jsonPointerGet
} from "@hyperjump/browser";

const json = `{ "a": { "b": [10, 20] } }`;
const { document, errors } = fromJson(json, "https://example.com/doc");
if (!hasStatus(document, "success", "recovered")) {
  throw new Error(jsonSyntaxErrorMessage(errors[0]));
}

const twenty = jsonPointerGet("/a/b/1", document.children[0]);
jsonValue(twenty); // 20
twenty.position?.start; // { line: 1, column: 20, offset: 19 }
```

The example checks the status with `hasStatus` first because only a document
whose status is `"failure"` can have error nodes. After that check, TypeScript
knows that the AST has none.

These are the functions for reading the AST:

| Function | Description |
| --- | --- |
| `jsonPointerGet(pointer, node)` | The node a JSON Pointer points to |
| `jsonStep(key, node)` | A property or item of a node |
| `jsonValue(node)` | The node's value as JavaScript, or a property name node's name |
| `jsonObjectHas`, `jsonObjectKeys`, `jsonObjectValues`, `jsonObjectEntries`, `jsonArrayIter` | Read objects and arrays |
| `toJson(node, options)` | The node as JSON text. The `space` option indents it like the `space` of `JSON.stringify`. It's a number of spaces or a string. |
| `fromJs(value, location)` | An AST from a JavaScript value, whose root has the `location`. A URL without a fragment is a document's, so its root is `#`. |

None of these follow references.

`jsonPointerGet` and `jsonStep` throw an error when they can't reach a value.
Its `cause.code` says why, and its `url` is the location that the pointer
couldn't reach. That location comes from the node's `location`, so it starts
with the URL you gave `fromJson` or `fromJs`.

| Code | The pointer |
| --- | --- |
| `ERR_POINTER_NOT_FOUND` | Names a property or an item that doesn't exist |
| `ERR_POINTER_INVALID_INDEX` | Uses a key that isn't an array index for an array |
| `ERR_POINTER_DUPLICATE_PROPERTY` | Names a property that the object has more than once |
| `ERR_POINTER_NOT_INDEXABLE` | Steps into a value that isn't an object or an array |

A string that isn't a JSON Pointer is a mistake in your code, not in the
document, so `jsonPointerGet` throws a `TypeError` without a code. A pointer
starts with `/` unless it's empty, and a `~` in it is only `~0`, for a `~`, or
`~1`, for a `/`.

Error messages often end up in logs and bug reports. To keep them from revealing
where your files are, the message shows a `file:` URL relative to the working
directory, such as `data/person.json#/name`. If you want your own messages to
show URLs the same way, use `relativeFileUrl(url)`.

In an AST from a parse whose status is `"failure"`, a value that the parser
couldn't parse is `undefined`. The root itself can be an error node, so check
that its `type` is `"json"` first:

```typescript
import { fromJson, jsonPointerGet } from "@hyperjump/browser";

const { document } = fromJson(`{ "a": }`, "https://example.com/doc");
const [node] = document.children;
if (node.type === "json") {
  jsonPointerGet("/a", node); // undefined

  try {
    jsonPointerGet("/b", node);
  } catch (error) {
    const { cause, message, url } = error as Error & {
      cause?: { code?: string };
      url?: string;
    };
    if (cause?.code === "ERR_POINTER_NOT_FOUND") {
      message; // "Property 'b' doesn't exist at https://example.com/doc#/b"
      url; // "https://example.com/doc#/b"
    }
  }
}
```

`toJson` throws an error whose `cause.code` is `"ERR_INVALID_VALUE"` for text
that the parser couldn't read as any value, such as `nope`.

`jsonValue` and `toJson` leave such a value out of an object. In an array, they
make it `null` so the items after it keep their positions.

## Build nodes

If you build nodes of your own, use `appendToLocation` to give them a
`location`. It gives you the parent's `location` with a property name or array
index added to its JSON Pointer, and it doesn't change the parent. It encodes
the location the way the parser does, so you can compare it to the locations
the parser made. This builds the node for a property `a b` of `x` with
`fromJs`:

```typescript
import {
  appendToLocation,
  fromJs,
  fromJson,
  hasStatus,
  jsonPointerGet
} from "@hyperjump/browser";

const { document } = fromJson(`{ "x": {} }`, "https://example.com/doc");
if (hasStatus(document, "success", "recovered")) {
  const parent = jsonPointerGet("/x", document.children[0]);
  const location = appendToLocation("a b", parent.location);
  // "https://example.com/doc#/x/a%20b"
  const node = fromJs(42, location);
}
```

## In a unified pipeline

`rejsonParse` and `rejsonStringify` are plugins for
[unified](https://unifiedjs.com/) pipelines that process JSON files. `jrefParse` and `jrefStringify`
do the same for JRef. With `accept: "recovered"`, the pipeline still processes a
file when the parser recovers from its syntax errors and reports those errors as
warnings.

The parse plugins take the `allowComments` option, which works as it does for
`fromJson`. The document's URL comes from the file's `path`, resolved against
the file's `cwd`, and the document node has it as its `url`. Node locations
start with it, and the parser resolves JRef references against it. For text that isn't
a file, such as text from stdin, give the parse plugin a `url` option instead:

```typescript
import { unified } from "unified";
import { jrefParse, jrefStringify } from "@hyperjump/browser";

const processor = unified()
  .use(jrefParse, { url: "https://example.com/doc.jref" })
  .use(jrefStringify);
```

Without a `path` or a `url`, the document has no URL and the parse fails. A file
that has both also fails, because they could disagree about where the document
is. The stringify plugins take the `space` option of `toJson`. To change the AST in a
pipeline, use a transformer plugin between the parse and stringify plugins.

The parse plugins produce a document node whose `status` says how parsing went.
Use `hasStatus` to check it. Unlike checking `status` directly, `hasStatus`
narrows the document's type in TypeScript. TypeScript then knows that a
document with the status `"success"` or `"recovered"` has no error nodes:

```typescript
import { hasStatus, type JsonDocumentNode } from "@hyperjump/browser";

const transformer = (tree: JsonDocumentNode) => {
  if (hasStatus(tree, "success", "recovered")) {
    // tree.children has no error nodes
  }
};
```

`hasStatus` works for JRef documents too.
