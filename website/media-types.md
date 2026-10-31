# Media types

A response's media type decides how it's parsed and what references and
fragments mean in it. JRef (`application/reference+json`, `.jref`) and JSON
(`application/json`, `.json`) are supported by default. How the media type is
found depends on where the document comes from:

| Where a document comes from | How its media type is found |
| --- | --- |
| HTTP | Its `Content-Type` header |
| A file | Its extension |

## Adding a media type

A media type plugin parses a response into a JRef-compatible AST. This example
is a plugin for a YAML version of JRef. It parses the YAML and hands the result
to the JRef parser:

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

const h = new Hyperjump();
h.addMediaTypePlugin(new YrefMediaTypePlugin());
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
it parses. A `Hyperjump` can only browse documents made of JRef nodes, so this
plugin's document type is `JrefMediaTypeDocument`, the same as the built-in JRef
plugin's. That type is for a document that parsed without errors.

Errors and tools use the positions in the AST to point at the source. This
example loses YAML's positions by going through JSON, so a real plugin would
build the AST from the YAML parser's nodes instead.

## Preferring a media type

Every request sends an `Accept` header that lists every supported media type.
To tell servers you prefer one, lower the quality of the others. This makes JRef
less preferred than JSON and the YAML plugin's media type:

```typescript
h.setMediaTypeQuality("application/reference+json", 0.9);
```

With that, requests send:

```text
Accept: application/reference+json; q=0.9, application/json, application/reference+yaml, */*; q=0.001
```

## Removing a media type

To stop supporting a media type, remove its plugin:

```typescript
h.removeMediaTypePlugin("application/reference+json");
```
