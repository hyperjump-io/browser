# Browse documents

You browse documents through a session. Give `get` a URL and it returns a node
for the value that URL identifies. From there, the `jref` functions read the
node and step to the values inside it. The ones that can reach a reference take
the session so they can follow it.

```typescript
const session = h.session();
const luke = await session.get("https://swapi.hyperjump.io/api/people/1");
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

The example skips objects and arrays because `jrefValue` throws for them.
Getting the whole value would mean following every reference inside it. That
could retrieve any number of documents and possibly the entire API. To read an
object or an array, step into it.

Each `jref` function has a `json` counterpart, such as `jsonStep` for
`jrefStep`, that reads the AST as it's written. [Parsing](parsing.md) describes
them. A node from a `json` function can be a reference that it didn't follow,
so TypeScript doesn't let you pass it to a `jref` function until you check that
its `type` isn't `"reference"`. A node from `get` or a `jref` function is never
a reference, so it works with both.

## Fragments

The fragment of the URL you give `get` identifies a value within the document.
In JRef, the fragment is a JSON Pointer:

```typescript
const homeworld = await session.get(
  "https://swapi.hyperjump.io/api/people/1#/homeworld"
);
```

The [JRef spec](https://github.com/hyperjump-io/json-reference/blob/main/spec.md)
says the pointer doesn't follow references because it applies to the document
as written. `#/homeworld` works because the reference is the last thing the
pointer reaches. The session follows that reference and gives you the homeworld.
`#/homeworld/name` doesn't work because the pointer can't go through the
reference. It looks for `name` in Luke's document, which doesn't have one. To
get the name, get the homeworld first. Then step into it.

What a fragment means depends on the media type. A plain JSON document ignores
the fragment.

## Errors

When something goes wrong, `get` and `step` throw one of these errors:

| Error | When |
| --- | --- |
| `RetrievalError` | `allowRetrieval` allows the URL, but the session can't retrieve or parse the document. Its `cause` says why. For example, it's a `FileNotFoundError`, an `HttpError` for a `404`, or an `HttpError` for a `403` when [`allowRetrieval`](allow-retrieval.md) doesn't allow the URL. Its `url` is the URL. |
| `JsonPointerError` | A fragment or a step doesn't find a value |
| `ReferenceCycleError` | Following references leads back to a reference that the session already followed |
| `UnsupportedMediaTypeError` | The response doesn't have a valid `Content-Type`, or no media type plugin handles it. It's the `cause` of a `RetrievalError`. |
| `UnsupportedUrlSchemeError` | No URL scheme plugin handles the URL. It's the `cause` of a `RetrievalError`. |

Error messages often end up in logs and bug reports. To keep them from revealing
where your files are, a message shows a `file:` URL relative to the working
directory, such as `data/person.json`. The error's `url` still has the whole
URL. If you want your own messages to show URLs the same way, use
`relativeFileUrl(url)`.

## Sessions

A session keeps every document it retrieves for as long as you use it. It
retrieves each document only once so everything you read through a session gives
you a consistent view. To see changes, start a new session.

A new session doesn't mean downloading everything again. Sessions from the same
`Hyperjump` share its HTTP cache, so a new session only retrieves what has
changed. For more information, see [HTTP caching](http-caching.md).

A session can also have its own `allowRetrieval`, for example to allow less
than its `Hyperjump` does. For more information, see
[Per session](allow-retrieval.md#per-session).
