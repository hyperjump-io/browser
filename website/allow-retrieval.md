# What can be retrieved

Documents refer to other documents by URL. Following a reference retrieves
whatever that URL identifies. That's fine when you control the documents. When
you don't, a document could refer to `http://169.254.169.254/` or
`file:///etc/passwd`. Following that reference would make your application
retrieve it. That's why nothing is retrieved unless the `allowRetrieval` config
allows it.

## `allowRetrieval`

`allowRetrieval` is a list of URLs. A URL that ends with `/` allows everything
under that URL. Any other URL allows only that exact URL. An empty list allows
nothing. A relative URL is resolved against the working directory in Node.js and
against the page in a browser. A worker has no page to resolve against, so use
absolute URLs there.

The default is `["./"]`, which allows the files in the working directory in
Node.js and what's in the page's directory in a browser. Setting your own list
replaces the default, so include `"./"` if you still want to allow local files.
This list allows local files and one API:

```typescript
const h = new Hyperjump({
  allowRetrieval: ["./", "https://api.example.com/"]
});
```

Retrieving a URL the list doesn't allow throws a `RetrievalNotAllowedError`. Its
`uri` is the URL that was refused. Its message tells you how to allow that URL:

```text
Retrieving 'https://example.com/other' isn't allowed. Use the 'allowRetrieval' config to allow it.
```

## Per session

Different parts of an application don't always trust the same things, so a
session can have its own list. The session's list replaces the config's list
instead of adding to it, which means a session can allow less than its
`Hyperjump` does:

```typescript
const session = h.session({ allowRetrieval: ["./documents/"] });
```

## What it protects against

Checking a URL before it's retrieved isn't enough on its own because there are
other ways to end up somewhere you didn't allow. `allowRetrieval` covers these
too:

- **Symlinks.** In Node.js, `file:` URLs are compared by their real paths so a
  symlink in an allowed directory can't lead outside it.
- **Redirects.** A response is checked again against the URL it came from so a
  redirect can't lead somewhere you didn't allow. The redirected request is
  still sent, but its response isn't used.
- **The cache.** The check happens before the URI scheme plugins run so a
  cached response can't get around the check.

The check applies to every URI scheme. That includes the ones you add. Some plugins
retrieve another URL along the way, such as a `urn:` plugin that maps URNs to
URLs. Both the URN and the URL need to be allowed for that to work. See
[URI schemes](uri-schemes.md).
