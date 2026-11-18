# Browse to a URL

`browse` retrieves a document through a Hyperjump session and gives you a target
for the value its URL identifies: the value's node and the document that the
node is in. A document can refer to values in other documents, and you don't
follow those references yourself. In a web browser, you click a link, and the
browser resolves its URL, requests it and shows you the page it leads to. In a
Hyperjump session, you navigate to a reference, and `browse` resolves its URL,
retrieves the document it leads to and gives you the value it refers to.

Luke's document at `https://swapi.hyperjump.io/api/people/1` has his homeworld
as a reference to the planet's document. Here's that part of it:

```jref
{
  "name": "Luke Skywalker",
  "homeworld": { "$ref": "/api/planets/1" }
}
```

When you browse to his homeworld, `browse` follows the reference, so the `name`
you select is the planet's, not Luke's:

```typescript
import { Hyperjump, browse, jrefSelect, jrefValue } from "@hyperjump/browser";

const session = new Hyperjump({
  allowRetrieval: ["https://swapi.hyperjump.io/"]
});

const url = "https://swapi.hyperjump.io/api/people/1#/homeworld";
const homeworld = await browse(session, url);
const name = await jrefSelect(session, "> [key=name]", homeworld);
if (name) {
  console.log(await jrefValue(session, name)); // Tatooine
}
```

A target's `node` is a node of a JSON abstract syntax tree (AST), which has its
`location` and its `position` in the document. Its `document` is the document
that the node is in. When a `jref` function follows a reference in the node,
the request comes from that document.
To read a target and step into it, see [Read targets](read-targets.md).

`browse` resolves a relative URL the way a web browser does. In a browser,
that's against the page. In Node.js, it's against the working directory, so
`browse(session, "data/film.json")` reads a file.

## What a URL identifies

Without a fragment, a URL identifies the root of its document. What a fragment
identifies depends on the document's media type, which the document says with
its `anchors`. For more information, see [Media types](media-types.md#a-plugin).

| Media type | A fragment identifies |
| --- | --- |
| JRef, which is `application/reference+json` and `.jref` files | The value at that JSON Pointer |
| JSON, which is `application/json` and `.json` files | The whole document, because JSON doesn't define fragments |

In JRef, a fragment is a JSON Pointer to a value in the document:

```typescript
const homeworld = await browse(
  session,
  "https://swapi.hyperjump.io/api/people/1#/homeworld"
);
```

The pointer applies to the document as it's written, so it doesn't follow
references. `#/homeworld` works because the reference is the last thing the
pointer reaches. `browse` follows that reference and gives you the homeworld.
`#/homeworld/name` doesn't work because the pointer can't go through the
reference. It looks for `name` in Luke's document, which doesn't have one. To
get the name, get the homeworld first. Then select its name. For more
information, see [Read targets](read-targets.md).

## References

A JRef document is JSON with references such as `{ "$ref": "../people/1" }`.
When the value a URL identifies is a reference, `browse` retrieves what it refers
to, and it keeps going until it reaches a value that isn't a reference. The
target's `document` is then the document that value is in, which can be another
one than the URL's. In a JSON document, an object with a `$ref` property is an
ordinary object.

A document can refer to anything, so a session only retrieves the URLs its
`allowRetrieval` allows, and only a file can refer to a file. For more
information, see [What a session can fetch](allow-retrieval.md).

## A document as it's written

`browse` follows a reference unless you tell it not to. With
`reference: "manual"`, it gives you the target the URL identifies as it's
written, even when its node is a reference. It works like `fetch`'s
`redirect: "manual"` option, which gives you a redirect instead of following
it. The target's `document` is then always the document at the URL, which is
how you get a whole document:

```typescript
const url = "https://swapi.hyperjump.io/api/films/1";
const { document } = await browse(session, url, { reference: "manual" });
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

## Priority

`browse` takes a `priority`, which works like `fetchpriority` in a browser. The references that `browse` follows have the same priority:

```typescript
await browse(session, url, { priority: "low" });
```

If you ask for a document again while the session is still retrieving it, its
request gets the more urgent of the two priorities. That way an app can load
documents ahead of time at `"low"` without holding up a document that it needs
now. For more information, see [Priorities](priorities.md).

## Options

`browse(session, url, options)` takes these options:

| Option | Description |
| --- | --- |
| `priority` | `"high"`, `"auto"`, or `"low"`, or a `PriorityController`'s signal. The references that `browse` follows have it too. For more information, see [Priority](#priority). |
| `reference` | `"follow"`, the default, follows a reference to the value it leads to. `"manual"` gives you the target as it's written. For more information, see [A document as it's written](#a-document-as-its-written). |
| `referencedFrom` | The target or the document that has the reference you're following. `browse` finds a document that it contains without retrieving it. For more information, see [Follow a reference](references.md#follow-a-reference). |
| `initiator` | The response of the request that caused this one, or its record. Only a `file:` document can refer to a `file:` URL. For more information, see [File URLs](file-urls.md#documents-from-the-web). |

## Errors

`browse` rejects with whatever kept it from giving you a value:

| Error | When |
| --- | --- |
| A network error | The session can't fetch the URL. For more information, see [Errors](errors.md). |
| An `Error` whose `cause.code` is `"ERR_HTTP_STATUS"` | The response's status isn't a success. The `cause.status` is the status. |
| An `Error` whose `cause.code` is `"ERR_UNSUPPORTED_MEDIA_TYPE"` | No media type parses the response. For more information, see [Media types](media-types.md). |
| A `SyntaxError` whose `cause.code` is `"ERR_SYNTAX"` | The document has a syntax error, or a reference that's an absolute `file:` URL. Its `cause` also has the error's `ruleId` and `place`. |
| An `Error` whose `cause.code` is `"ERR_ABSOLUTE_FILE_URL"` | A document that isn't a file says it contains a document with a `file:` URL. For more information, see [Media types](media-types.md#a-plugin). |
| An `Error` whose `cause.code` is `"ERR_ANCHOR_NOT_FOUND"` | The fragment isn't an anchor of the document or a JSON Pointer. The `cause.anchor` is the fragment. |
| An `Error` whose `cause.code` starts with `"ERR_POINTER_"` | The fragment doesn't identify a value. For more information, see [Parse JSON and JRef](parsing.md#read-the-ast). |
| An `Error` whose `cause.code` is `"ERR_REFERENCE_CYCLE"` | Following references leads back to a reference that `browse` already followed. The `cause.chain` lists the URLs. |

Every one of these errors has the URL that failed as its `url`:

```typescript
try {
  await browse(session, "https://swapi.hyperjump.io/api/films/99");
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
