# URL schemes

A URL scheme plugin retrieves documents for URLs that start with one of its
schemes. A `Hyperjump` handles `http:`, `https:`, and `file:` by default,
although `file:` isn't available in browsers.

## Add a URL scheme

A URL scheme plugin defines the `schemes` it handles and a `retrieve` function
that takes a `Request` and returns a `Response`, like `fetch`. You configure plugins with the `urlSchemePlugins`
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

  async retrieve(request: Request): Promise<Response> {
    const url = this.#mappings[request.url.toLowerCase()];
    if (!url) {
      throw Error(`Not found: ${request.url}`);
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

A plugin implements `UrlSchemePlugin`. The session calls its `retrieve` with a
`Request` for the URL, without its fragment. The request has the
[`headers`](http-headers.md) config's headers for its URL, and these:

| Header | Description |
| --- | --- |
| `Accept` | The media types that the `Hyperjump` supports |
| `Referer` | The URL of the document the reference came from, if there is one |

A response needs a `Content-Type` so that the session can parse it. If your
scheme doesn't have media types the way files don't, list its URLs in the
[`mediaTypeByExtension`](media-types.md#servers-that-send-the-wrong-media-type)
config, and the session gives its responses the media type of their extension.
A response doesn't need a URL. When it doesn't have one, its URL is the URL that
the session retrieved.

### Redirects

A URL scheme plugin redirects by returning a response with a status of 301,
302, 303, 307, or 308 and a `Location` header. `Response.redirect` creates that
response for you. The session resolves a relative `Location` against the URL of
the response. Then it checks the result against `allowRetrieval` and retrieves
it with the plugin for its scheme.

The session gives that plugin the same headers, including `Referer`, so a
redirect can't get around a check on where a reference came from. For
example, the browser refuses a file that a document on the web refers to. It
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
the `Hyperjump` uses the later one. A replacement for `http:` or `https:` still
gets the session's [HTTP cache](http-caching.md),
[headers](http-headers.md), and `Accept` header.
