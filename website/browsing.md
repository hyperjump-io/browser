# Browse documents

Browsing is reading a value and stepping to the values inside it. `get` gives
you a node for the value a URL identifies, and from there the `jref` functions
read the node and step into it. The ones that can reach a reference take the
session so they can follow it.

```typescript
import { Hyperjump, get } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});
const luke = await get(session, "https://swapi.hyperjump.io/api/people/1");
```

## Nodes

A node is a JRef abstract syntax tree (AST) node for a value in a document. Its
`jsonType` is the kind of JSON value it holds, such as `"object"`. Its
`location` is the URL that identifies the value. The URL's fragment is a JSON
Pointer to where the value is in its document.

```typescript
luke.jsonType; // "object"
luke.location; // "https://swapi.hyperjump.io/api/people/1#"
```

## Read nodes

Following a reference can mean retrieving a document, so the functions that can
follow a reference are asynchronous and take the session. The others don't
need either.

```typescript
import {
  jrefArrayIter,
  jrefObjectEntries,
  jrefObjectHas,
  jrefObjectKeys,
  jrefObjectValues,
  jrefStep,
  jrefValue
} from "@hyperjump/browser";
```

| Function | Returns |
| --- | --- |
| `await jrefStep(session, key, node)` | The property `key` of an object or the item at index `key` of an array |
| `jrefArrayIter(session, node)` | An async iterator over the items of an array |
| `jrefObjectValues(session, node)` | An async iterator over the property values of an object |
| `jrefObjectEntries(session, node)` | An async iterator over `[name, node]` pairs of an object |
| `jrefObjectKeys(node)` | An iterator over the property names of an object |
| `jrefObjectHas(key, node)` | Whether an object has a property |
| `jrefValue(node)` | The value of a string, number, boolean, or null as JavaScript |

None of these functions give you a reference. Every function that returns nodes
follows any reference it reaches and returns the referenced value instead. If
that value is another reference, the function follows that one too. This
example steps from Luke to his homeworld and prints the homeworld's properties
that aren't objects or arrays:

```typescript
const homeworld = await jrefStep(session, "homeworld", luke);

for await (const [name, value] of jrefObjectEntries(session, homeworld)) {
  if (value.jsonType !== "object" && value.jsonType !== "array") {
    console.log(name, jrefValue(value));
  }
}
```

The example skips objects and arrays because `jrefValue` throws an error for
them, whose `cause.code` is `"ERR_STRUCTURED_VALUE"`.
Getting the whole value would mean following every reference inside it. That
could retrieve any number of documents and possibly the entire API. To read an
object or an array, step into it.

Each `jref` function has a `json` counterpart, such as `jsonStep` for
`jrefStep`, that reads the AST as it's written. For more information, see
[Parse JSON and JRef](parsing.md). A node from a `json` function can be a
reference that it didn't follow, so TypeScript doesn't let you pass it to a
`jref` function until you check that its `type` isn't `"reference"`. A node from
`get` or a `jref` function is never a reference, so it works with both.

A reference can lead to a document in any of the session's media types. So in
TypeScript, a node from `get` or a `jref` function is a node of any of them. A
session with the default media types gives JRef and JSON nodes. If you add a
media type with nodes of its own, check a node's `type` to tell which it is.
For more information, see [Media types](media-types.md).

## Visit every value

*Coming soon*

`jrefVisit` walks a node and every value under it depth first in document
order, following references along the way. It works like `visit` from
`unist-util-visit`, and its visitor returns the same `CONTINUE`, `SKIP`, and
`EXIT` values. The visitor gets each node with the key it's at, the node that
has it, and its depth below the node you started from:

```typescript
import { CONTINUE, jrefVisit, SKIP } from "@hyperjump/browser";

await jrefVisit(session, luke, (node, key, parent, depth) => {
  console.log(depth, key, node.location);
  return key === "films" ? SKIP : CONTINUE;
});
```

The session follows a reference just before the visitor gets its value, so
returning `SKIP` keeps the session from retrieving the documents under that
node. That's also how you stop at a depth: return `SKIP` when `depth` is as
deep as you want to go. If a reference leads back to a value that the walk is
inside, like a recursive definition, the visitor gets that value but not the
values inside it again, so the walk ends.

To visit only some nodes, put a test before the visitor like you would with
`unist-util-visit`. A string matches a node's `type`, an object matches nodes
with the same properties, a function matches nodes it returns `true` for, and an
array matches nodes that match any test in it. In TypeScript, the visitor's
node has the type of the nodes that match. This example prints every number,
including the ones in the documents that Luke's references lead to:

```typescript
await jrefVisit(session, luke, { jsonType: "number" }, (node, key) => {
  console.log(key, jrefValue(node));
});
```

The walk still goes through the values that don't match and follows their
references to find what's under them.

## Select values

*Coming soon*

`jrefSelect` and `jrefSelectAll` find values with a selector like `select` and
`selectAll` from `unist-util-select` do, following references along the way.
`jrefSelect` gives you the first value that matches, or `undefined` if none
does. `jrefSelectAll` gives you all of them in the order it reaches them.

```typescript
import { jrefSelect, jrefSelectAll } from "@hyperjump/browser";

const film = await get(session, "https://swapi.hyperjump.io/api/films/1");

const director = await jrefSelect(session, "> [key=director]", film);
const names = await jrefSelectAll(session, "> [key=characters] > * > [key=name]", film);
```

Each character is a reference to another document. The second selector steps
into each one and gets its name, which takes a `jrefStep` for each step and a
`jrefArrayIter` for the characters without a selector.

| Selector | Matches |
| --- | --- |
| `[key=name]` | The value of the property `name`, or the item at index `name` of an array, such as `[key=0]` |
| `[jsonType=object]` | A value whose property has that value. They're compared as text, so `[value=42]` matches `42` and `"42"`. |
| `[value]` | A value that has the property. Strings, numbers, booleans, and null have a `value`. |
| `json` or `*` | A value whose `type` is `json`, or any value |
| `:root` or `:scope` | The value you start from |
| `a b` | A `b` anywhere under an `a` |
| `a > b` | A `b` directly in an `a` |
| `> b` | A `b` directly in the value you start from |
| `a, b` | An `a` or a `b` |

Quote a value that has characters other than letters, digits, `_`, `-`, and
`$`, such as `[key="first name"]`. A selector that isn't one of these, such as
`:has()` or `a + b`, throws a `SyntaxError` that says what's supported.

The session only follows a reference if the selector could match the value it
leads to or something inside it. `> [key=director]` doesn't retrieve any
characters because none of them can be the film's `director`, and `jrefSelect`
stops at the first match. A selector without `>` like `[key=name]` can match
at any depth, so it follows every reference under the value you start from. On
an API like this one that could be the whole API, so start a selector with `>`
unless you mean to search everything.

## How deep a walk goes

*Coming soon*

`jrefVisit`, `jrefSelect`, and `jrefSelectAll` can't go more than 1000 levels
below the value you start from. If one would, it throws an error whose
`cause.code` is `"ERR_MAX_DEPTH"`, so references that lead to new documents
without end, like a `next` link on every page of results, can't keep it going.
The error's `url` is the value it would go inside. If you expect a walk to go
that deep, pass a bigger `maxDepth` or `Infinity` as the last argument:

```typescript
await jrefVisit(session, node, visitor, { maxDepth: 2000 });
```

It's only an error if the walk would actually go deeper. A value at the limit is
fine if the walk skips it, it has nothing inside it, or nothing inside it can
match.

The limit is a safeguard, so to stop at a depth on purpose, say so in the walk.
A visitor returns `SKIP` at the `depth` it gets as its fourth argument:

```typescript
await jrefVisit(session, firstPage, (node, key, parent, depth) => {
  // The first page and the next two
  return depth === 2 ? SKIP : CONTINUE;
});
```

A selector made of `>` steps only goes as deep as it's written, like
`> [key=next] > [key=next]` for the next two pages.

## The tree as it's written

Documents are [unist](https://github.com/syntax-tree/unist) trees, so the
unified ecosystem's utilities work on them too. They read a tree as it's
written, without following references. For example, `visit` from
`unist-util-visit` finds every reference in a document:

```typescript
import { visit } from "unist-util-visit";
import { getDocument } from "@hyperjump/browser";

const document = await getDocument(session, "https://swapi.hyperjump.io/api/films/1");
visit(document, "reference", (node) => {
  console.log(node.href);
});
```

## Fragments

The fragment of the URL you give `get` identifies a value within the document.
In JRef, the fragment is a JSON Pointer:

```typescript
const homeworld = await get(
  session,
  "https://swapi.hyperjump.io/api/people/1#/homeworld"
);
```

The pointer applies to the document as it's written, so it doesn't follow
references. `#/homeworld` works because the reference is the last thing the
pointer reaches. `get` follows that reference and gives you the homeworld.
`#/homeworld/name` doesn't work because the pointer can't go through the
reference. It looks for `name` in Luke's document, which doesn't have one. To
get the name, get the homeworld first. Then step into it.

## Follow a reference yourself

To follow a reference node with `get`, pass the node as `referencedFrom`. The
session then knows which document the reference is in. That document causes the
request, and `get` finds a document that it contains without retrieving it:

```typescript
import { get, jsonStep } from "@hyperjump/browser";

const node = jsonStep("homeworld", luke);
const homeworld = node.type === "reference"
  ? await get(session, node.href, { referencedFrom: node })
  : node;
```

For the errors that these functions throw, see
[Get documents](documents.md#errors).
