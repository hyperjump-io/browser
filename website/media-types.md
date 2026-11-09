# Media types

A document's media type defines how a session parses the document. It also
defines what references and fragments mean in that document. A `Hyperjump`
reads JRef and JSON by default:

| Media type | `Content-Type` | Extension |
| --- | --- | --- |
| JRef | `application/reference+json` | `.jref` |
| JSON | `application/json` | `.json` |

Where a document's media type comes from depends on where the document comes
from:

| Where a document comes from | Where its media type comes from |
| --- | --- |
| HTTP | Its `Content-Type` header, or its extension for [URLs you list](#servers-that-send-the-wrong-media-type) |
| A file | Its extension |

## Add a media type

A media type plugin defines the `mediaType` it parses and a `parse` function
that turns a `Response` into a JRef-compatible abstract syntax tree (AST). You
configure plugins with the `mediaTypePlugins` config when you create the
`Hyperjump`. This example is a plugin for a YAML version of JRef. It parses the
YAML and passes the result to the JRef parser:

```typescript
import {
  fromJref,
  Hyperjump,
  jrefSyntaxErrorMessage
} from "@hyperjump/browser";
import type {
  JrefMediaTypeDocument,
  MediaTypePlugin,
  RetrievedResponse
} from "@hyperjump/browser";
import YAML from "yaml";

type YrefDocument = JrefMediaTypeDocument;

class YrefMediaTypePlugin implements MediaTypePlugin<YrefDocument> {
  mediaType = "application/reference+yaml";
  extensions = [".yref"];

  async parse(response: RetrievedResponse): Promise<YrefDocument> {
    const json = JSON.stringify(YAML.parse(await response.text()));
    const result = fromJref(json, response.url);
    if (result.status !== "success") {
      throw Error(jrefSyntaxErrorMessage(result.errors[0]));
    }

    return {
      type: "jref-document",
      status: result.status,
      children: [result.node],
      comments: [],
      url: response.url
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

| Property | Description |
| --- | --- |
| `mediaType` | The media type it parses |
| `extensions` | File extensions for it, such as `.yref`. A name that starts with `/` is a whole filename, such as `/.bowerrc`. |
| `parse(response, session)` | Parses a `RetrievedResponse` into a document node. If parsing needs other documents, retrieve them with `session`. Throw if the document isn't valid. |
| `fragmentPointer(document, fragment)` | Returns the JSON Pointer a fragment identifies. Without it, the session ignores fragments. |
| `quality` | Optional. Its quality in the `Accept` header, a number from 0 to 1 with at most three decimal places. The `Hyperjump` constructor throws for any other value. |

A `RetrievedResponse` is a `Response` whose `url` the session parsed, without
its fragment, so a plugin can use it as the document's `url` and as the URL it
resolves references against.

A plugin is a `MediaTypePlugin<D>`, where `D` is the type of the document node
it parses. A `Hyperjump` can only browse documents made of JRef nodes. This
plugin's documents come from the JRef parser, so the plugin uses
`JrefMediaTypeDocument`. That's the built-in JRef plugin's type for a document
that parsed without errors.

Errors and tools use the positions in the AST to point at the source. This
example loses YAML's positions by going through `JSON.parse`, so a real plugin
would build the AST from the YAML parser's nodes instead.

A plugin for a media type that the `Hyperjump` already supports replaces the
existing plugin and takes its place in the `Accept` header. When more than one
plugin in the list has the same media type, the `Hyperjump` uses the later one.

## Prefer a media type

Every request sends an `Accept` header that lists every media type the
`Hyperjump` supports with its plugin's `quality`. To ask servers for the one
you prefer, lower the quality of the others. The JRef and JSON plugins take a
`quality` option. This example replaces the default JRef plugin with one that
gives JRef a quality of 0.9. JSON and YRef keep the default quality of 1, so
servers get a request to prefer them:

```typescript
import { Hyperjump, JrefMediaTypePlugin } from "@hyperjump/browser";

const h = new Hyperjump({
  mediaTypePlugins: [
    new JrefMediaTypePlugin({ quality: 0.9 }),
    new YrefMediaTypePlugin()
  ]
});
```

With that, requests send this header:

```text
Accept: application/reference+json; q=0.9, application/json, application/reference+yaml, */*; q=0.001
```

## Servers that send the wrong media type

A document from HTTP gets its media type from the `Content-Type` header that the
server sends. Some servers send the wrong one or none at all. GitHub sends
`text/plain` for every file at `raw.githubusercontent.com`, so a session doesn't
read those files as JSON. The file's `.json` extension isn't an authority on
what the server sends, and anyone can give a URL a misleading extension.

The HTTP plugin uses extensions only for the URLs listed in its
`mediaTypeByExtension` option. To trust a server's extensions, replace the
default HTTP plugin with one that has that option. In this example, documents
from GitHub get their media type from their extension:

```typescript
import { Hyperjump, HttpUrlSchemePlugin } from "@hyperjump/browser";

const h = new Hyperjump({
  allowRetrieval: ["https://raw.githubusercontent.com/my-org/my-repo/"],
  urlSchemePlugins: [new HttpUrlSchemePlugin({
    mediaTypeByExtension: ["https://raw.githubusercontent.com/"]
  })]
});
```

With that, a session parses a document as JSON when its URL is under
`https://raw.githubusercontent.com/` and ends with `.json`, whatever its
`Content-Type` says. When no media type plugin defines the URL's extension, the
document keeps the media type the server sent. The extension is the end of the
URL's path, so a query such as the `?token=` on a private repository's raw URL
doesn't hide the extension.

URLs in `mediaTypeByExtension` match the way they do in
[`allowRetrieval`](allow-retrieval.md). A URL that ends with `/` matches every
URL under it. Any other URL matches only itself. Every URL has to be an absolute
`http:` or `https:` URL. When a server redirects a request, the plugin matches
the URL that the redirect leads to because the server at that URL is the one
that sent the document.
