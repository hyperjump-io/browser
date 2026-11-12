# Get documents

`get` retrieves a document through a session and gives you the value its URL
identifies. A document can refer to values in other documents, and `get`
follows those references for you:

```typescript
import { Hyperjump, get, jsonValue } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});

const url = "https://swapi.hyperjump.io/api/films/1#/director";
const director = await get(session, url);
jsonValue(director); // "George Lucas"
```

The value is a node of a JSON abstract syntax tree (AST), which has its
`location` and its `position` in the document. To read a node and step into it,
see [Browse documents](browsing.md).

`get` resolves a relative URL the way the session does. In Node.js, that's
against the working directory, so `get(session, "data/film.json")` reads a file.

## What a URL identifies

Without a fragment, a URL identifies the root of its document. What a fragment
identifies depends on the document's media type:

| Media type | A fragment identifies |
| --- | --- |
| JRef, which is `application/reference+json` and `.jref` files | The value at that JSON Pointer |
| JSON, which is `application/json` and `.json` files | The whole document, because JSON doesn't define fragments |

## References

A JRef document is JSON with references such as `{ "$ref": "../people/1" }`.
When the value a URL identifies is a reference, `get` retrieves what it refers
to, and it keeps going until it reaches a value that isn't a reference. In a
JSON document, an object with a `$ref` property is an ordinary object.

A document can refer to anything, so a session only retrieves the URLs its
`allowRetrieval` allows, and only a file can refer to a file. For more
information, see [What a session can fetch](allow-retrieval.md).

## The whole document

`getDocument` retrieves a document the same way and gives you the document
itself. It ignores the fragment and doesn't follow references:

```typescript
import { getDocument } from "@hyperjump/browser";

const url = "https://swapi.hyperjump.io/api/films/1";
const document = await getDocument(session, url);
document.url; // "https://swapi.hyperjump.io/api/films/1"
document.children[0]; // The root node
```

## A session keeps its documents

A session keeps every document it retrieves, so it fetches and parses each one
once, however many references lead to it. Two calls for the same document get
the same object, even when the second call comes before the first one finishes.
To see a document that changed, create a new session.

The session also keeps a document under the URL its response came from, so a
URL that redirects and the URL it redirects to give you the same document.

## Errors

`get` and `getDocument` reject with whatever kept them from giving you a
value:

| Error | When |
| --- | --- |
| A network error | The session can't fetch the URL. For more information, see [Errors](errors.md). |
| An `Error` whose `cause.code` is `"ERR_HTTP_STATUS"` | The response's status isn't a success. The `cause.status` is the status. |
| An `Error` whose `cause.code` is `"ERR_UNSUPPORTED_MEDIA_TYPE"` | No media type parses the response. For more information, see [Media types](media-types.md). |
| A `SyntaxError` | The document has a syntax error, or a reference that's an absolute `file:` URL. Its `cause` is the error, with a `ruleId` and a `place`. |
| A `JsonPointerError` | The fragment doesn't identify a value |
| An `Error` whose `cause.code` is `"ERR_REFERENCE_CYCLE"` | Following references leads back to a reference that `get` already followed. The `cause.chain` lists the URLs. |

The errors with a `cause.code` also have the URL that failed as their `url`:

```typescript
try {
  await get(session, "https://swapi.hyperjump.io/api/films/99");
} catch (error) {
  const { cause, url } = error as {
    cause?: { code?: string; status?: number };
    url?: string;
  };
  if (cause?.code === "ERR_HTTP_STATUS" && cause.status === 404) {
    // There's nothing at `url`
  }
}
```
