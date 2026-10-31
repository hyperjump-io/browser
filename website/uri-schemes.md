# URI schemes

A URI scheme plugin retrieves documents for URIs that start with one of its
schemes. `http:`, `https:`, and `file:` are supported by default, although
`file:` isn't available in browsers.

## Adding a URI scheme

A plugin has the `schemes` it handles and a `retrieve` function that returns a
`Response`. This example supports `urn:` by mapping each URN to a URL and
retrieving the URL with the `Hyperjump`'s own `retrieve`:

```typescript
import { Hyperjump } from "@hyperjump/browser";

const mappings: Record<string, string> = {
  "urn:example:luke": "https://swapi.hyperjump.io/api/people/1"
};

const h = new Hyperjump({
  allowRetrieval: ["urn:example:luke", "https://swapi.hyperjump.io/"]
});

h.addUriSchemePlugin({
  schemes: ["urn"],
  async retrieve(urn, options) {
    const url = mappings[urn.toLowerCase()];
    if (!url) {
      throw Error(`Not found: ${urn}`);
    }

    return await h.retrieve(url, options);
  }
});

const luke = await h.session().get("urn:example:luke");
```

[`allowRetrieval`](allow-retrieval.md) applies to every scheme, so it has to
allow the URN. The response is then checked again against the URL it came from,
so the URL that the URN maps to must be allowed too.

`addUriSchemePlugin` takes a `UriSchemePlugin`, so `retrieve`'s parameters are
typed for you. Pass `options` on to `retrieve` because it has what the request
needs. That includes which document the reference came from and `accept`, an
`Accept` header for the media types that are supported.

A response doesn't need a `Content-Type`. When it doesn't have one, its media
type comes from its URL's extension the same way a file's does.

## Replacing a URI scheme

Adding a plugin for a scheme that's already supported replaces the
existing plugin. That's how you give the HTTP plugin a different cache or
headers. See [HTTP caching](http-caching.md) and
[HTTP headers](http-headers.md).

## Removing a URI scheme

To stop supporting a scheme, remove its plugin:

```typescript
h.removeUriSchemePlugin("http");
h.removeUriSchemePlugin("https");
h.removeUriSchemePlugin("file");
```
