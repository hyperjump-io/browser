# Browsing documents

A session retrieves documents and follows their references. Get a node with
`get`, then use the session's methods to read it.

```typescript
const session = h.session();
const luke = await session.get("https://swapi.hyperjump.io/api/people/1");
```

## Nodes

A node is a value in a document. Its `jsonType` is `"object"`, `"array"`,
`"string"`, `"number"`, `"boolean"`, or `"null"`. Its `location` is its URI.
The URI's fragment is a JSON Pointer to the node.

```typescript
luke.jsonType; // "object"
luke.location; // "https://swapi.hyperjump.io/api/people/1#"
```

## Reading nodes

The methods that can follow a reference are async. The others aren't.

| Method | Returns |
| --- | --- |
| `await session.step(key, node)` | The property `key` of an object or the item at index `key` of an array |
| `session.iter(node)` | An async iterator over the items of an array |
| `session.keys(node)` | An iterator over the property names of an object |
| `session.values(node)` | An async iterator over the property values of an object |
| `session.entries(node)` | An async iterator over `[name, node]` pairs of an object |
| `session.has(key, node)` | Whether an object has a property |
| `session.value(node)` | The value of a string, number, boolean, or null as JavaScript |

Every method that returns nodes follows references, so you never get a
reference back. If a reference leads to another reference, that one is
followed too.

```typescript
const homeworld = await session.step("homeworld", luke);

for await (const [name, value] of session.entries(homeworld)) {
  if (value.jsonType !== "object" && value.jsonType !== "array") {
    console.log(name, session.value(value));
  }
}
```

`value` throws for an object or an array. Getting the whole value would
mean following every reference inside it, which could retrieve any number
of documents. Step into it instead.

## Fragments

A URI's fragment is a JSON Pointer to a value in the document:

```typescript
const homeworld = await session.get(
  "https://swapi.hyperjump.io/api/people/1#/homeworld"
);
```

The pointer is applied to the document as written, without following
references, as the JRef spec says. So `#/homeworld` gets the homeworld,
following the reference at the end, but `#/homeworld/name` doesn't exist in
this document. Step from the node instead.

What a fragment means depends on the media type. For a plain JSON document,
the fragment is ignored.

## Errors

`get` and `step` throw:

| Error | When |
| --- | --- |
| `RetrievalNotAllowedError` | `allowRetrieval` doesn't allow the URL. See [What can be retrieved](allow-retrieval.md). |
| `RetrievalError` | The URL is allowed, but the document can't be retrieved or parsed. Its `cause` says why. For example, it's an `HttpError` for a `404`, or a `FileNotFoundError`. Its `uri` is the URL. |
| `JsonPointerError` | A fragment or a step doesn't find a value |
| `ReferenceCycleError` | Following references leads back to a reference that was already followed |
| `UnsupportedMediaTypeError` | No media type plugin handles the response's `Content-Type` |
| `UnsupportedUriSchemeError` | No URI scheme plugin handles the URI |

In an error's message, a `file:` URL is shown relative to the working
directory, like `data/person.json`. That way the message doesn't reveal
where your files are. The error's `uri` has the whole URL. To show URLs the
same way in your own messages, use `relativeFileUri(uri)`.

## Sessions

A session keeps every document it retrieves for as long as you use it.
Each document is retrieved only once, so you always see a consistent view.
Start a new session to see changes.

Sessions from the same `Hyperjump` share its HTTP cache, so a new session
only retrieves what has changed. See [HTTP caching](http-caching.md).

A session can have its own `allowRetrieval`. See
[What can be retrieved](allow-retrieval.md#per-session).
