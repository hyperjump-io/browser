# Browse documents

You browse documents through a session. Give `get` a URL and it returns a node
for the value that URL identifies. From there, the session's methods let you
read the node and step to the values inside it while following references along
the way.

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

Following a reference can mean retrieving a document, so the methods that can
follow a reference are asynchronous and the others aren't.

| Method | Returns |
| --- | --- |
| `await session.step(key, node)` | The property `key` of an object or the item at index `key` of an array |
| `session.iter(node)` | An async iterator over the items of an array |
| `session.keys(node)` | An iterator over the property names of an object |
| `session.values(node)` | An async iterator over the property values of an object |
| `session.entries(node)` | An async iterator over `[name, node]` pairs of an object |
| `session.has(key, node)` | Whether an object has a property |
| `session.value(node)` | The value of a string, number, boolean, or null as JavaScript |

None of these methods give you a reference. Every method that returns nodes
follows any reference it reaches and returns the referenced value instead. If
that value is another reference, the method follows that one too. This example
steps from Luke to his homeworld and prints the homeworld's properties that
aren't objects or arrays:

```typescript
const homeworld = await session.step("homeworld", luke);

for await (const [name, value] of session.entries(homeworld)) {
  if (value.jsonType !== "object" && value.jsonType !== "array") {
    console.log(name, session.value(value));
  }
}
```

The example skips objects and arrays because `value` throws for them. Getting
the whole value would mean following every reference inside it. That could
retrieve any number of documents and possibly the entire API. To read an object
or an array, step into it.

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
| `RetrievalNotAllowedError` | `allowRetrieval` doesn't allow the URL. For more information, see [What a session can retrieve](allow-retrieval.md). |
| `RetrievalError` | `allowRetrieval` allows the URL, but the session can't retrieve or parse the document. Its `cause` says why. For example, it's an `HttpError` for a `404` or a `FileNotFoundError`. Its `uri` is the URL. |
| `JsonPointerError` | A fragment or a step doesn't find a value |
| `ReferenceCycleError` | Following references leads back to a reference that the session already followed |
| `UnsupportedMediaTypeError` | The response doesn't have a valid `Content-Type`, or no media type plugin handles it. It's the `cause` of a `RetrievalError`. |
| `UnsupportedUriSchemeError` | No URI scheme plugin handles the URL. It's the `cause` of a `RetrievalError`. |

Error messages often end up in logs and bug reports. To keep them from revealing
where your files are, a message shows a `file:` URL relative to the working
directory, such as `data/person.json`. The error's `uri` still has the whole
URL. If you want your own messages to show URLs the same way, use
`relativeFileUri(uri)`.

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
