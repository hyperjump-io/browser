# URI schemes

A URI scheme plugin retrieves documents for the URIs that start with its
schemes. `http:`, `https:`, and `file:` are supported by default. `file:`
isn't available in browsers.

## Adding a URI scheme

A plugin has the `schemes` it handles and a `retrieve` function that returns
a `Response`. This one supports `urn:` by mapping URNs to URLs. It retrieves
the URLs with the `Hyperjump`'s own `retrieve`:

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

[`allowRetrieval`](allow-retrieval.md) applies to every scheme, so it has
to allow the URN. The response is checked again against the URL it came
from, so the URL that the URN maps to must be allowed too.

`addUriSchemePlugin` takes a `UriSchemePlugin`, so `retrieve`'s parameters
are typed. Pass `options` on to `retrieve`. It has what the request needs,
such as which document the reference came from.

## Replacing a URI scheme

Adding a plugin for a scheme that's already supported replaces the
existing plugin. That's how you give the HTTP plugin a different cache or
headers. See [HTTP caching](http-caching.md) and
[HTTP headers](http-headers.md).

## Removing a URI scheme

```typescript
h.removeUriSchemePlugin("http");
h.removeUriSchemePlugin("https");
h.removeUriSchemePlugin("file");
```
