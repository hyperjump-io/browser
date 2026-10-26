# Media types

A response's media type decides how it's parsed and what references and
fragments mean in it. JRef (`application/reference+json`, `.jref`) and JSON
(`application/json`, `.json`) are supported by default.

| Where a document comes from | How its media type is found |
| --- | --- |
| HTTP | Its `Content-Type` header |
| A file | Its extension |

## Adding a media type

A media type plugin parses a response into a JRef-compatible AST. Here's
one for a YAML version of JRef, which parses YAML and hands the result to
the JRef parser:

```javascript
import { Hyperjump } from "@hyperjump/browser";
import { fromJref } from "@hyperjump/browser/jref";
import YAML from "yaml";

class YrefMediaTypePlugin {
  mediaType = "application/reference+yaml";
  extensions = [".yref"];

  async parse(response) {
    const json = JSON.stringify(YAML.parse(await response.text()));
    const { status, node } = fromJref(json, response.url);
    return {
      type: "jref-document",
      status,
      children: [node],
      uri: response.url
    };
  }

  // A fragment is a JSON Pointer, as it is for JRef
  fragmentPointer(_document, fragment) {
    return decodeURIComponent(fragment);
  }
}

const h = new Hyperjump();
h.addMediaTypePlugin(new YrefMediaTypePlugin());
```

| Property | What it is |
| --- | --- |
| `mediaType` | The media type it parses |
| `extensions` | File extensions for it, like `.yref`. A name that starts with `/` is a whole filename, like `/.bowerrc`. |
| `parse(response, session)` | Parse a `Response` into a document node. A media type that needs other documents to parse one retrieves them with `session`. |
| `fragmentPointer(document, fragment)` | The JSON Pointer a fragment identifies. Without it, fragments are ignored. |
| `quality` | Its quality in the `Accept` header (optional) |

Positions in the AST are what errors and tools point to. This example
loses YAML's positions by going through JSON. A real plugin would build the
AST from the YAML parser's nodes.

## Preferring a media type

Requests send an `Accept` header with every supported media type. To tell
servers you prefer one, lower the quality of the others:

```javascript
h.setMediaTypeQuality("application/reference+json", 0.9);
```

Requests then send:

```text
Accept: application/reference+json; q=0.9, application/json, application/reference+yaml, */*; q=0.001
```

## Removing a media type

```javascript
h.removeMediaTypePlugin("application/reference+json");
```
