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
