# What can be retrieved

Documents reference other documents by URL, and following a reference
retrieves it. If you browse documents you don't control, a document could
reference `http://169.254.169.254/` or `file:///etc/passwd`, and make your
application retrieve it.

So nothing is retrieved unless the `allowRetrieval` config allows it.

## `allowRetrieval`

It's a list of URLs:

- One that ends with `/` allows everything under it.
- Any other allows only that URL.
- A relative one is resolved against the working directory in Node.js and
  against the page in a browser.

The default is `["./"]`: files in the working directory in Node.js, and
what's in the page's directory in a browser.

```typescript
const h = new Hyperjump({
  allowRetrieval: ["./", "https://api.example.com/"]
});
```

Include `"./"` to keep allowing local files when you add to it. `[]`
allows nothing.

Anything else throws a `RetrievalNotAllowedError`, whose `uri` is the URL
that was refused:

```text
Retrieving 'https://example.com/other' isn't allowed. Use the 'allowRetrieval' config to allow it.
```

## Per session

A session can have its own list. It replaces the config, instead of adding
to it, so a session can allow less.

```typescript
const session = h.session({ allowRetrieval: ["./documents/"] });
```

Use it when parts of your application trust different things.

## What it protects against

- **Symlinks.** In Node.js, `file:` URLs are compared by their real paths,
  so a symlink in an allowed directory can't lead outside it.
- **Redirects.** A response is checked again by the URL it came from, so a
  redirect can't lead somewhere you didn't allow. The redirected request is
  still sent, though. Only its response isn't used.
- **The cache.** It's checked before the URI scheme plugins, so a cached
  response isn't a way around it.

It applies to every URI scheme, including ones you add. A plugin for a
scheme like `urn:` that retrieves another URL needs both allowed (see
[URI schemes](uri-schemes.md)).

In a worker, there's no page to resolve relative URLs against, so use
absolute ones.
