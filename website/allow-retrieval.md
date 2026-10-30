# What can be retrieved

Documents reference other documents by URL, and following a reference
retrieves the document. If you browse documents you don't control, one of
them could reference `http://169.254.169.254/` or `file:///etc/passwd` and
make your application retrieve it.

That's why nothing is retrieved unless the `allowRetrieval` config allows
it.

## `allowRetrieval`

It's a list of URLs:

- A URL that ends with `/` allows everything under it.
- Any other URL allows only itself.
- A relative URL is resolved against the working directory in Node.js and
  against the page in a browser.

The default is `["./"]`. In Node.js that allows files in the working
directory. In a browser it allows what's in the page's directory.

```typescript
const h = new Hyperjump({
  allowRetrieval: ["./", "https://api.example.com/"]
});
```

When you set your own list, include `"./"` if you still want to allow
local files. `[]` allows nothing.

Retrieving anything else throws a `RetrievalNotAllowedError`. Its `uri` is
the URL that was refused:

```text
Retrieving 'https://example.com/other' isn't allowed. Use the 'allowRetrieval' config to allow it.
```

## Per session

A session can have its own list. It replaces the config's list instead of
adding to it, so a session can allow less.

```typescript
const session = h.session({ allowRetrieval: ["./documents/"] });
```

Use it when parts of your application trust different things.

## What it protects against

- **Symlinks.** In Node.js, `file:` URLs are compared by their real paths.
  A symlink in an allowed directory can't lead outside it.
- **Redirects.** A response is checked again against the URL it came from,
  so a redirect can't lead somewhere you didn't allow. The redirected
  request is still sent, but its response isn't used.
- **The cache.** The check happens before the URI scheme plugins run, so a
  cached response can't get around it.

It applies to every URI scheme, including ones you add. Some plugins
retrieve another URL, like a plugin for `urn:` that maps URNs to URLs. Both
the URN and the URL need to be allowed. See [URI schemes](uri-schemes.md).

In a worker there's no page to resolve relative URLs against, so use
absolute URLs.
