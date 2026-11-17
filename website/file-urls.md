# File URLs

On a server, a session can fetch `file:` URLs the way a browser opens files. Use
`nodeTransport()` as the bottom of your stack:

```typescript
import { Hyperjump, nodeTransport } from "@hyperjump/browser";

const session = new Hyperjump({
  stack: nodeTransport({ file: { root: "./site" } })
});

const page = await session.fetch("site/index.html");
```

A relative URL is relative to the working directory, and by default a session
can fetch only the files in it. `nodeTransport()` fetches `http:`, `https:`, and
`data:` URLs too.

## Responses

A file's response is a 200 with these headers:

| Header | Value |
| --- | --- |
| `Content-Length` | The file's size |
| `Last-Modified` | When the file last changed |

A file's response has no `Content-Type` header, because a file doesn't have a
media type.

## Errors

As in a browser, a file the session can't read is a network error, not a 404.
`session.fetch` rejects with a `TypeError` when the file doesn't exist or the
session can't read it, the URL is a directory, or the method isn't `GET` or `HEAD`. The
message says which, and the error's `cause` is the error from the filesystem,
so a file that doesn't exist has a `cause.code` of `"ENOENT"`. For more
information, see [Errors](errors.md).

## Limit what a session can read

A document can refer to any file on the machine. If your app fetches
URLs that come from documents, use the `root` option so only files in that
directory are readable:

```typescript
nodeTransport({ file: { root: "./site" } });
```

A URL outside `root` is a network error, and so is a symbolic link inside
`root` that points outside it.

`root` limits every session on the stack. A session's `allowRetrieval` limits
that session, and by default it allows only the files in the working directory.
For more information, see [What a session can fetch](allow-retrieval.md).

## Documents from the web

Only a document from a file can refer to a `file:` URL, so a document from the
web can't read your files. The session finds the document a request comes from
by its `initiator`, and refuses a `file:` URL for one that isn't a file with a
network error. Adding the URL to `allowRetrieval` doesn't change that. A
redirect can't take a document from the web to a file either.

```typescript
const page = await session.fetch("https://example.com/page.json");

// Rejects with a TypeError
await session.fetch("file:///home/me/project/secret.json", {
  initiator: page
});
```

A request without an `initiator` is your app's own, so it can fetch any file
`allowRetrieval` allows. When you follow a reference, pass the document it's in
as the `initiator`. For a document the session didn't fetch, pass its URL as
the `referrer` instead:

```typescript
// Rejects with a TypeError
await session.fetch("file:///home/me/project/secret.json", {
  referrer: "https://example.com/mine.json"
});
```

`browse` does this for you. A tree that you parsed yourself, such as one from a
[unified pipeline](parsing.md#in-a-unified-pipeline), comes from its URL. In a
pipeline, that's the file's path or the `url` option. Only a tree whose URL is a
`file:` URL can refer to a file.

## Symbolic links

A session follows a symbolic link, and the response's URL is the URL of the file it
points to. Relative references in the file resolve against where the file is,
not where the link is.

## Leave out file URLs

To fetch only `http:`, `https:`, and `data:` URLs on a server, use
`nodeTransport({ file: false })`, or `defaultTransport()`, which also works in
browsers.

## Options

`nodeTransport(options)` takes these options:

| Option | Description |
| --- | --- |
| `file` | The options for `file:` URLs, or `false` to leave them out |
| `file.root` | The directory that the session can read files in. The default is the whole filesystem. |
| `schemes` | Fetchers for more schemes, or to replace one, by scheme, such as `"s3:"`. For more information, see [Transports](transports.md). |
