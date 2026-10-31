# URI schemes

A URI scheme plugin retrieves documents for URIs that start with one of its
schemes. `http:`, `https:`, and `file:` are supported by default, although
`file:` isn't available in browsers.

## Adding a URI scheme

A URI scheme plugin defines the `schemes` it handles and a `retrieve` function
that returns a `Response`. You configure plugins with the `uriSchemePlugins`
config when you create the `Hyperjump`. This example is a plugin for `urn:`.
It's created with the URLs that URNs map to. It retrieves a URN by retrieving
that URN's URL with the `retrieve` function in its options:

```typescript
import { Hyperjump } from "@hyperjump/browser";
import type { RetrieveOptions, UriSchemePlugin } from "@hyperjump/browser";

class UrnUriSchemePlugin implements UriSchemePlugin {
  schemes = ["urn"];
  #mappings: Record<string, string>;

  constructor(mappings: Record<string, string>) {
    this.#mappings = mappings;
  }

  async retrieve(urn: string, options: RetrieveOptions): Promise<Response> {
    const url = this.#mappings[urn.toLowerCase()];
    if (!url) {
      throw Error(`Not found: ${urn}`);
    }

    return await options.retrieve(url, options);
  }
}

const h = new Hyperjump({
  allowRetrieval: ["urn:example:luke", "https://swapi.hyperjump.io/"],
  uriSchemePlugins: [new UrnUriSchemePlugin({
    "urn:example:luke": "https://swapi.hyperjump.io/api/people/1"
  })]
});

const luke = await h.session().get("urn:example:luke");
```

[`allowRetrieval`](allow-retrieval.md) applies to every scheme, so it has to
allow the URN. The response is then checked again against the URL it came from,
so the URL that the URN maps to must be allowed too.

A plugin implements `UriSchemePlugin`. Its `retrieve` is given
`RetrieveOptions`. The options have what the request needs:

| Option | What it is |
| --- | --- |
| `referencedFrom` | The URL of the document the reference came from, if there is one |
| `accept` | An `Accept` header for the media types that are supported |
| `retrieve(uri, options)` | Retrieves another URI with the plugin for that URI's scheme |

Pass `options` on when you call `options.retrieve` so the other plugin gets the
same options.

A response doesn't need a `Content-Type`. When it doesn't have one, its media
type comes from its URL's extension just like a file's media type does.

## Replacing a URI scheme

A plugin for a scheme that's already supported replaces the existing plugin for
that scheme. The existing plugin still handles any other schemes it lists. When
more than one plugin in the list has the same scheme, the later one is used.
Replacing the HTTP plugin this way is how you give it a different cache or
headers. `HttpUriSchemePlugin` takes these options:

| Option | What it is |
| --- | --- |
| `cache` | Where to cache responses. Without one, the plugin gets its environment's default. `false` doesn't cache. See [HTTP caching](http-caching.md). |
| `headers` | Headers to send with requests, by URL. See [HTTP headers](http-headers.md). |
