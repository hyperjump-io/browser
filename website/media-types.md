# Media types

A session can get documents in JRef and JSON. To get documents in another
format, give the session a media type plugin for it in its `mediaTypes`:

```typescript
import {
  Hyperjump,
  defaultMediaTypes,
  fromJs,
  type DocumentNode,
  type JsonNode,
  type MediaTypePlugin
} from "@hyperjump/browser";
import { parse } from "yaml";

const yamlMediaType: MediaTypePlugin<DocumentNode<JsonNode>> = {
  mediaType: "application/yaml",
  extensions: [".yaml", ".yml"],
  parse: async (response) => {
    const value = parse(await response.text());
    return {
      type: "yaml-document",
      children: [fromJs(value, response.url)],
      url: response.url
    };
  }
};

const session = new Hyperjump({
  mediaTypes: [...defaultMediaTypes, yamlMediaType]
});
```

`mediaTypes` is the whole list, so include `defaultMediaTypes` to keep JRef and
JSON.

The plugin's type says what its documents' nodes are, which here is
`JsonNode`. A reference can lead to a document in any of a session's media
types, so `get` and the `jref` functions return a node of any of them. With
this session, that's a JRef node or a JSON node. If a plugin's type is only
`MediaTypePlugin`, TypeScript doesn't know what the session's nodes are, and
they're `unknown`.

## A plugin

A plugin is a plain object:

| Property | Description |
| --- | --- |
| `mediaType` | The media type, such as `application/yaml`, or a range such as `text/*` |
| `extensions` | The names that files of this media type have. An extension starts with `.`, such as `.yaml`. A whole filename starts with `/`, such as `/.bowerrc`. |
| `quality` | The media type's quality in the `Accept` header, from 0 to 1. Without it, servers take the quality to be 1. |
| `parse(response, session)` | Parses a response into a document. The response's `url` is the document's URL, and the document it returns has that `url`. If the response can't be a document, it throws. The session is for a format that needs other documents to parse one, which it gets with `getDocument(session, url, { initiator: response })`. |
| `fragmentPointer(document, fragment)` | The JSON Pointer to the node that a fragment identifies. Without it, a fragment identifies the whole document. |

If a document contains other documents that have URLs of their own, return them
as the document's `embedded` property: an object of documents by their URLs.
A reference in the document, or in one of the documents it contains, finds them
there, and the session doesn't retrieve them. A reference in any other document
doesn't find them, so a document can't change what other documents get.

For `get` to find values in a document and follow its references, the
document's root has to be a JSON AST node. `fromJs` makes one from a JavaScript
value. A reference is a node whose `type` is `"reference"`, with the URL it
refers to as its `href`.

## Which plugin parses a response

A session chooses the plugin from the response's `Content-Type` header. The most
specific match wins:

1. A plugin for that media type
2. A plugin for its structured suffix. The JSON plugin parses
   `application/problem+json` because its suffix is `json`.
3. A plugin for a range that includes it, such as `application/*`

When two plugins match equally, the one that comes first in the list wins. To
use your own plugin for a media type that a default handles, put yours before
the defaults:

```typescript
const session = new Hyperjump({
  mediaTypes: [myJsonMediaType, ...defaultMediaTypes]
});
```

A file doesn't have a `Content-Type`, so a session chooses the plugin from the
file's name. The longest extension that matches wins, so a plugin for
`.schema.json` gets `person.schema.json` and the JSON plugin gets
`person.json`.

If no plugin matches, `get` rejects with an error whose `cause.code` is
`"ERR_UNSUPPORTED_MEDIA_TYPE"`.

## The `Accept` header

A session sends an `Accept` header that lists its media types in order. To tell
servers which one you prefer, give a plugin a `quality`. The built-in plugins
are plain objects too, so copy one to change it:

```typescript
import {
  Hyperjump,
  jrefMediaType,
  jsonMediaType
} from "@hyperjump/browser";

const session = new Hyperjump({
  mediaTypes: [jrefMediaType, { ...jsonMediaType, quality: 0.5 }]
});
```

```text
Accept: application/reference+json, application/json; q=0.5, */*; q=0.001
```
