# Browsing documents

Documents are browsed through a session. Give `get` a URL and it returns a node
for the value that URL identifies. From there, the session's methods let you
read the node and step to the values inside it, following references along the
way.

```typescript
const session = h.session();
const luke = await session.get("https://swapi.hyperjump.io/api/people/1");
```

## Nodes

A node is a JRef AST node for a value in a document. Its `jsonType` tells you
what kind of JSON value it is. Its `location` is the URI that identifies the
value. The URI's fragment is a JSON Pointer to where the value is in its
document.

```typescript
luke.jsonType; // "object"
luke.location; // "https://swapi.hyperjump.io/api/people/1#"
```

## Reading nodes

Following a reference can mean retrieving a document, so the methods that can
follow a reference are async. The others aren't.

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
follows any reference it reaches and returns the value it refers to instead. If
that value is another reference, it's followed too. This example steps from
Luke to his homeworld and prints the homeworld's properties that aren't objects
or arrays:

```typescript
const homeworld = await session.step("homeworld", luke);

for await (const [name, value] of session.entries(homeworld)) {
  if (value.jsonType !== "object" && value.jsonType !== "array") {
    console.log(name, session.value(value));
  }
}
```

The example skips objects and arrays because `value` throws for them. Getting
the whole value would mean following every reference inside it, and that could
retrieve any number of documents. To read an object or an array, step into it.

## Fragments

The fragment of the URL you give `get` identifies a value within the document.
In JRef, the fragment is a JSON Pointer:

```typescript
const homeworld = await session.get(
  "https://swapi.hyperjump.io/api/people/1#/homeworld"
);
```

The [JRef spec](https://github.com/hyperjump-io/json-reference/blob/main/spec.md)
says the pointer doesn't follow references because it's applied to the document
as written. That has a consequence that can be surprising. `#/homeworld` works
because the reference is the last thing the pointer reaches, so the session
follows it and gives you the homeworld. `#/homeworld/name` doesn't work because
there's no `name` in Luke's document for the pointer to find. To get the name,
get the homeworld and step into it instead.

What a fragment means depends on the media type. In a plain JSON document, the
fragment is ignored.

## Errors

When something goes wrong, `get` and `step` throw one of these errors:

| Error | When |
| --- | --- |
| `RetrievalNotAllowedError` | `allowRetrieval` doesn't allow the URL. See [What can be retrieved](allow-retrieval.md). |
| `RetrievalError` | The URL is allowed, but the document can't be retrieved or parsed. Its `cause` says why. For example, it's an `HttpError` for a `404`, or a `FileNotFoundError`. Its `uri` is the URL. |
| `JsonPointerError` | A fragment or a step doesn't find a value |
| `ReferenceCycleError` | Following references leads back to a reference that was already followed |
| `UnsupportedMediaTypeError` | No media type plugin handles the response's `Content-Type` |
| `UnsupportedUriSchemeError` | No URI scheme plugin handles the URI |

Error messages often end up in logs and bug reports, so a `file:` URL in a
message is shown relative to the working directory, such as `data/person.json`.
That keeps the message from revealing where your files are. The whole URL is
still on the error's `uri`. If you want your own messages to show URLs the same
way, use `relativeFileUri(uri)`.

## Sessions

A session keeps every document it retrieves for as long as you use it. Each
document is retrieved only once, so everything you read through a session gives
you a consistent view. To see changes, start a new session.

A new session doesn't mean downloading everything again. Sessions from the same
`Hyperjump` share its HTTP cache, so a new session only retrieves what has
changed. See [HTTP caching](http-caching.md).

A session can also have its own `allowRetrieval`, for example to allow less
than its `Hyperjump` does. See
[What can be retrieved](allow-retrieval.md#per-session).
