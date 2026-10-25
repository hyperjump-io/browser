# Media types

Support for the JSON and [JRef] media types are included by default, but you can
add support for any media type you like as long as it can be represented in a
[JRef]-compatible way.

```javascript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump();

// Add support for YAML version of JRef (YRef)
export class YrefMediaTypePlugin {
  constructor(quality) {
    this.quality = quality;
  }

  async parse(response) {
    return {
      type: "jref-document",
      uri: response.url,
      children: [parseYamlToJrefAst(await response.text())]
    };
  }

  // A fragment is a JSON Pointer, as it is for JRef
  fragmentPointer(document, fragment) {
    return decodeURIComponent(fragment);
  }

  async fileMatcher(path) {
    return /[^/]\.yref$/.test(path);
  }
}
h.addMediaTypePlugin("application/reference+yaml", new YrefMediaTypePlugin());

// Prefer "YRef" over JRef by reducing the quality for JRef.
h.setMediaTypeQuality("application/reference+json", 0.9);

// Only support YRef by removing JRef support.
h.removeMediaTypePlugin("application/reference+json");
```

[JRef]: ../src/jref/README.md
