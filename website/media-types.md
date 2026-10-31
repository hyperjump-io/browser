# Media types

A document's media type defines how the document is parsed. It also defines
what references and fragments mean in that document. JRef
(`application/reference+json`, `.jref`) and JSON (`application/json`, `.json`)
are supported by default. How the media type is found depends on where the
document comes from:

| Where a document comes from | How its media type is found |
| --- | --- |
| HTTP | Its `Content-Type` header |
| A file | Its extension |

## Adding a media type

A media type plugin defines the `mediaType` it parses and a `parse` function
that turns a `Response` into a JRef-compatible AST. You configure plugins with
the `mediaTypePlugins` config when you create the `Hyperjump`. This example is a
plugin for a YAML version of JRef. It parses the YAML and hands the result to
the JRef parser:

```typescript
import { Hyperjump } from "@hyperjump/browser";
import type {
  JrefMediaTypeDocument,
  MediaTypePlugin
} from "@hyperjump/browser";
import { fromJref } from "@hyperjump/browser/jref";
import { jsonSyntaxErrorMessage } from "@hyperjump/browser/json";
import YAML from "yaml";

type YrefDocument = JrefMediaTypeDocument;

class YrefMediaTypePlugin implements MediaTypePlugin<YrefDocument> {
  mediaType = "application/reference+yaml";
  extensions = [".yref"];

  async parse(response: Response): Promise<YrefDocument> {
    const json = JSON.stringify(YAML.parse(await response.text()));
    const result = fromJref(json, response.url);
    if (result.status !== "success") {
      throw Error(jsonSyntaxErrorMessage(result.errors[0]));
    }

    return {
      type: "jref-document",
      status: result.status,
      children: [result.node],
      comments: [],
      uri: response.url
    };
  }

  // A fragment is a JSON Pointer, as it is for JRef
  fragmentPointer(_document: YrefDocument, fragment: string) {
    return decodeURIComponent(fragment);
  }
}

const h = new Hyperjump({
  mediaTypePlugins: [new YrefMediaTypePlugin()]
});
```

A plugin has these properties:

| Property | What it is |
| --- | --- |
| `mediaType` | The media type it parses |
| `extensions` | File extensions for it, like `.yref`. A name that starts with `/` is a whole filename, like `/.bowerrc`. |
| `parse(response, session)` | Parses a `Response` into a document node. If parsing needs other documents, retrieve them with `session`. Throw if the document can't be parsed. |
| `fragmentPointer(document, fragment)` | Returns the JSON Pointer a fragment identifies. Without it, fragments are ignored. |
| `quality` | Optional. Its quality in the `Accept` header. |

A plugin is a `MediaTypePlugin<D>`, where `D` is the type of the document node
it parses. A `Hyperjump` can only browse documents made of JRef nodes. This
plugin's documents come from the JRef parser, so the plugin uses
`JrefMediaTypeDocument`, which is the built-in JRef plugin's type for a document
that parsed without errors.

Errors and tools use the positions in the AST to point at the source. This
example loses YAML's positions by going through `JSON.parse`, so a real plugin
would build the AST from the YAML parser's nodes instead.

A plugin for a media type that's already supported replaces the existing plugin,
including the existing plugin's place in the `Accept` header. When more than one
plugin in the list has the same media type, the later one is used.

## Preferring a media type

Every request sends an `Accept` header that lists every supported media type
with its plugin's `quality`. To tell servers you prefer one, lower the quality
of the others. The JRef and JSON plugins take a `quality` option. This example
replaces the default JRef plugin with one that gives JRef a quality of 0.9. JSON
and YRef keep the default quality of 1, so servers are told to prefer them:

```typescript
import { Hyperjump, JrefMediaTypePlugin } from "@hyperjump/browser";

const h = new Hyperjump({
  mediaTypePlugins: [
    new JrefMediaTypePlugin({ quality: 0.9 }),
    new YrefMediaTypePlugin()
  ]
});
```

With that, requests send:

```text
Accept: application/reference+json; q=0.9, application/json, application/reference+yaml, */*; q=0.001
```
