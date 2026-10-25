# URI schemes

By default, `http(s):` and `file:` URIs are supported (`file:` is not available
in the browser). You can add support for
additional URI schemes using plugins.

```javascript
import { Hyperjump } from "@hyperjump/browser";

const h = new Hyperjump();

// Add support for the `urn:` scheme
class UrnSchemePlugin {
  async retrieve(urn, options) {
    let { nid, nss, query, fragment } = parseUrn(urn);
    nid = nid.toLowerCase();

    if (!mappings[nid]?.[nss]) {
      throw Error(`Not Found -- ${urn}`);
    }

    let uri = mappings[nid][nss];
    uri += query ? "?" + query : "";
    uri += fragment ? "#" + fragment : "";

    // The response is checked against `allowRetrieval` by the URL it came
    // from, so the URL a URN maps to has to be allowed too
    return await h.retrieve(uri, options);
  }
}
h.addUriSchemePlugin("urn", new UrnSchemePlugin());

// Only support `urn:` by removing default plugins
h.removeUriSchemePlugin("http");
h.removeUriSchemePlugin("https");
h.removeUriSchemePlugin("file");
```
