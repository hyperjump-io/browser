# What can be retrieved

Documents aren't trusted, so a reference can't make your application
retrieve whatever it names, like an internal address or a file outside your
project. Only what the `allowRetrieval` config allows is retrieved. It's a
list of URLs. One that ends with `/` allows everything under it, and any
other allows only itself. A relative one is resolved against the working
directory in Node.js and the page in a browser. The default is `["./"]`:
files in the working directory in Node.js, and what's in the page's
directory in a browser. Anything else is a `RetrievalNotAllowedError`.

```javascript
const h = new Hyperjump({
  allowRetrieval: ["./", "https://api.example.com/"]
});
```

A session can have its own list, which it uses instead, for when different
parts of your application can retrieve different things.

```javascript
const session = h.session({ allowRetrieval: ["./documents/"] });
```

It's checked before the URI scheme plugins, so a cached response isn't a way
around it. In Node.js, `file:` URLs are compared by their real paths, so a
symlink can't lead outside a directory you allow. A response is checked
again by the URL it came from, so a redirect can't lead somewhere you didn't
allow. The redirected request is still sent, though. Its response just isn't
used. `[]` allows nothing. In a worker, there's no page to resolve relative
URLs against, so use absolute ones.
