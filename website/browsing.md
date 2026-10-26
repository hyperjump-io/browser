# Browsing documents

A session retrieves documents and follows their references. Get a node with
`get`, then use the session's methods to read it.

```javascript
const session = h.session();
const luke = await session.get("https://swapi.hyperjump.io/api/people/1");
```

## Nodes

A node is a value in a document. Its `jsonType` is `"object"`, `"array"`,
`"string"`, `"number"`, `"boolean"`, or `"null"`, and its `location` is its
URI, with a JSON Pointer to it in the fragment.

```javascript
luke.jsonType; // "object"
luke.location; // "https://swapi.hyperjump.io/api/people/1#"
```

## Reading nodes

The methods that can follow a reference are async. The others aren't.

| Method | Returns |
| --- | --- |
| `await session.step(key, node)` | The property `key` of an object, or the item at index `key` of an array |
| `session.iter(node)` | An async iterator over the items of an array |
| `session.keys(node)` | An iterator over the property names of an object |
| `session.values(node)` | An async iterator over the property values of an object |
| `session.entries(node)` | An async iterator over `[name, node]` pairs of an object |
| `session.has(key, node)` | Whether an object has a property |
| `session.value(node)` | The value of a string, number, boolean, or null as JavaScript |

Every method that returns nodes follows references, so you never get a
reference. If a reference leads to another reference, that's followed too.

```javascript
const homeworld = await session.step("homeworld", luke);

for await (const [name, value] of session.entries(homeworld)) {
  if (value.jsonType !== "object" && value.jsonType !== "array") {
    console.log(name, session.value(value));
  }
}
```

`value` throws for an object or an array. Getting their whole value would
mean following every reference in them, which could retrieve any number of
documents. Step into them instead.

## Fragments

A URI's fragment is a JSON Pointer to a value in the document:

```javascript
const homeworld = await session.get(
  "https://swapi.hyperjump.io/api/people/1#/homeworld"
);
```

The pointer is applied to the document as written, without following
references, as the JRef spec says. So `#/homeworld` gets the homeworld,
following the reference at the end, but `#/homeworld/name` doesn't exist in
this document. Step from the node instead.

For a plain JSON document, the fragment is ignored. What a fragment means
depends on the media type.

## Errors

`get` and `step` throw:

| Error | When |
| --- | --- |
| `RetrievalNotAllowedError` | `allowRetrieval` doesn't allow the URL (see [What can be retrieved](allow-retrieval.md)) |
| `RetrievalError` | The URL is allowed, but the document can't be retrieved or parsed. Its `cause` says why, like an `HttpError` for a `404`. |
| `JsonPointerError` | A fragment or a step doesn't find a value |
| `ReferenceCycleError` | Following references leads back to a reference that was already followed |
| `UnsupportedMediaTypeError` | No media type plugin handles the response's `Content-Type` |
| `UnsupportedUriSchemeError` | No URI scheme plugin handles the URI |

## Sessions

A session keeps every document it retrieves for as long as you use it, so
each is retrieved once, and you see a consistent view of them. Start a new
session to see changes.

Sessions from the same `Hyperjump` share its HTTP cache, so a new session
only retrieves what's changed (see [HTTP caching](http-caching.md)).

A session can have its own `allowRetrieval` (see
[What can be retrieved](allow-retrieval.md#per-session)).
