# URI schemes

A URI scheme plugin retrieves documents for the URIs that start with its
schemes. `http:`, `https:`, and `file:` are supported by default. `file:`
isn't available in browsers.

## Adding a URI scheme

A plugin has the `schemes` it handles and a `retrieve` function that returns
a `Response`. This one supports `urn:` by mapping URNs to URLs, which it
retrieves with the `Hyperjump`'s own `retrieve`:

```typescript
import { Hyperjump } from "@hyperjump/browser";

const mappings = {
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

[`allowRetrieval`](allow-retrieval.md) applies to every scheme, so it
allows the URN. The response is checked again by the URL it came from, so
the URL it maps to must be allowed too.

Pass `options` on to `retrieve`. It has what the request needs, like which
document the reference is from.

## Replacing a URI scheme

Adding a plugin for a scheme that's supported replaces its plugin. That's
how the HTTP plugin is given a different cache or headers (see
[HTTP caching](http-caching.md) and [HTTP headers](http-headers.md)).

## Removing a URI scheme

```typescript
h.removeUriSchemePlugin("http");
h.removeUriSchemePlugin("https");
h.removeUriSchemePlugin("file");
```
