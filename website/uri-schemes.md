# URI schemes

A URI scheme plugin retrieves documents for URIs that start with one of its
schemes. `http:`, `https:`, and `file:` are supported by default, although
`file:` isn't available in browsers.

## Adding a URI scheme

A plugin has the `schemes` it handles and a `retrieve` function that returns a
`Response`. You configure plugins with `uriSchemePlugins` when you create the
`Hyperjump`. This example supports `urn:` by mapping each URN to a URL
and retrieving the URL with the `retrieve` function the plugin is given:

```typescript
import { Hyperjump } from "@hyperjump/browser";

const mappings: Record<string, string> = {
  "urn:example:luke": "https://swapi.hyperjump.io/api/people/1"
};

const h = new Hyperjump({
  allowRetrieval: ["urn:example:luke", "https://swapi.hyperjump.io/"],
  uriSchemePlugins: [{
    schemes: ["urn"],
    async retrieve(urn, options) {
      const url = mappings[urn.toLowerCase()];
      if (!url) {
        throw Error(`Not found: ${urn}`);
      }

      return await options.retrieve(url, options);
    }
  }]
});

const luke = await h.session().get("urn:example:luke");
```

[`allowRetrieval`](allow-retrieval.md) applies to every scheme, so it has to
allow the URN. The response is then checked again against the URL it came from,
so the URL that the URN maps to must be allowed too.

`uriSchemePlugins` is a list of `UriSchemePlugin`s, so `retrieve`'s parameters
are typed for you. `options` has what the request needs:

- Which document the reference came from
- `accept`, an `Accept` header for the media types that are supported
- `retrieve`, which retrieves another URI with the plugin for that URI's scheme

Pass `options` on when you call `options.retrieve` so the other plugin gets the
same options.

A response doesn't need a `Content-Type`. When it doesn't have one, its media
type comes from its URL's extension just like a file's media type does.

## Replacing a URI scheme

A plugin for a scheme that's already supported replaces the existing plugin for
that scheme. The existing plugin still handles any other schemes it lists. When
more than one plugin in the list has the same scheme, the later one is used.
Replacing the HTTP plugin this way is how you give it a different cache or
headers. See [HTTP caching](http-caching.md) and
[HTTP headers](http-headers.md).
