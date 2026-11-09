# URL schemes

A URL scheme plugin retrieves documents for URLs that start with one of its
schemes. A `Hyperjump` handles `http:`, `https:`, and `file:` by default,
although `file:` isn't available in browsers.

## Add a URL scheme

A URL scheme plugin defines the `schemes` it handles and a `retrieve` function
that returns a `Response`. You configure plugins with the `urlSchemePlugins`
config when you create the `Hyperjump`. This example is a plugin for `urn:`. You
create it with the URL that each Uniform Resource Name (URN) maps to. It
retrieves a URN by redirecting to the URL that the URN maps to:

```typescript
import { Hyperjump } from "@hyperjump/browser";
import type { UrlSchemePlugin } from "@hyperjump/browser";

class UrnUrlSchemePlugin implements UrlSchemePlugin {
  schemes = ["urn"];
  #mappings: Record<string, string>;

  constructor(mappings: Record<string, string>) {
    this.#mappings = mappings;
  }

  async retrieve(urn: string): Promise<Response> {
    const url = this.#mappings[urn.toLowerCase()];
    if (!url) {
      throw Error(`Not found: ${urn}`);
    }

    return Response.redirect(url);
  }
}

const h = new Hyperjump({
  allowRetrieval: ["urn:example:luke", "https://swapi.hyperjump.io/"],
  urlSchemePlugins: [new UrnUrlSchemePlugin({
    "urn:example:luke": "https://swapi.hyperjump.io/api/people/1"
  })]
});

const luke = await h.session().get("urn:example:luke");
```

The session follows the plugin's redirect the same way it follows a redirect
from a server. [`allowRetrieval`](allow-retrieval.md) applies to every URL the
session retrieves, so the list has to allow both the URN and the URL that the
URN maps to.

A plugin implements `UrlSchemePlugin`. The session calls its `retrieve` with
`RetrieveOptions`, which have what the request needs:

| Option | Description |
| --- | --- |
| `referencedFrom` | The URL of the document the reference came from, if there is one |
| `accept` | An `Accept` header for the media types that the `Hyperjump` supports |
| `mediaTypeByExtension(url)` | The media type of the URL's extension, or `undefined` if no media type plugin has it |

A response needs a `Content-Type` so that the session can parse it. If your
scheme doesn't have media types the way files don't, use
`options.mediaTypeByExtension` to get the one for the URL's extension. A
response doesn't need a URL. When it doesn't have one, its URL is the URL that
the session retrieved.

### Redirects

A URL scheme plugin redirects by returning a response with a status of 301,
302, 303, 307, or 308 and a `Location` header. `Response.redirect` creates that
response for you. The session resolves a relative `Location` against the URL of
the response. Then it checks the result against `allowRetrieval` and retrieves
it with the plugin for its scheme.

The session gives that plugin the same options, including `referencedFrom`, so
a redirect can't get around a check that the other plugin makes. For example,
the `file:` plugin refuses a file that a document on the web refers to. It
refuses that file just the same when the document refers to a URN that maps to
it.

A URN can map to a file instead of a URL on the web. `Response.redirect` takes
only an absolute URL, so give the `urn:` plugin from the earlier example a
`file:` URL instead of a path:

```typescript
import { pathToFileURL } from "node:url";

const plugin = new UrnUrlSchemePlugin({
  "urn:example:person": pathToFileURL("./schemas/person.json").href
});
```

## Replace a URL scheme

A plugin for a scheme that the `Hyperjump` already handles replaces the
existing plugin for that scheme. The existing plugin still handles any other
schemes it lists. When more than one plugin in the list has the same scheme,
the `Hyperjump` uses the later one. Replacing the HTTP plugin this way is how
you change its options. `HttpUrlSchemePlugin` takes these options:

| Option | Description |
| --- | --- |
| `cache` | Where to cache responses. Without one, the plugin gets its environment's default. `false` doesn't cache. For more information, see [HTTP caching](http-caching.md). |
| `headers` | Headers to send with requests, by URL. For more information, see [HTTP headers](http-headers.md). |
| `mediaTypeByExtension` | URLs whose documents get their media type from their extension instead of the `Content-Type` header. For more information, see [Servers that send the wrong media type](media-types.md#servers-that-send-the-wrong-media-type). |
