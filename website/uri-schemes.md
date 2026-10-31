# URI schemes

A URI scheme plugin retrieves documents for URIs that start with one of its
schemes. `http:`, `https:`, and `file:` are supported by default, although
`file:` isn't available in browsers.

## Adding a URI scheme

A plugin has the `schemes` it handles and a `retrieve` function that returns a
`Response`. Plugins are configured when you create the `Hyperjump`, with
`uriSchemePlugins`. This example supports `urn:` by mapping each URN to a URL
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
are typed for you. `options` has what the request needs: which document the
reference came from, `accept`, an `Accept` header for the media types that are
supported, and `retrieve`, which retrieves another URI with the plugin for its
scheme. Pass `options` on when you call `retrieve` so the other plugin gets
them too.

A response doesn't need a `Content-Type`. When it doesn't have one, its media
type comes from its URL's extension the same way a file's does.

## Replacing a URI scheme

A plugin for a scheme that's already supported replaces the plugin that
supported it, but only for the schemes it lists. When more than one plugin in
the list has the same scheme, the later one is used. That's how you give the
HTTP plugin a different cache or headers. See [HTTP caching](http-caching.md)
and [HTTP headers](http-headers.md).
