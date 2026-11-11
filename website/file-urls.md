# File URLs

On a server, a session can fetch `file:` URLs the way a browser opens files. Use
`nodeTransport()` as the bottom of your stack:

```typescript
import { Session, nodeTransport } from "@hyperjump/browser";

const session = new Session(nodeTransport({ file: { root: "./site" } }));

const page = await session.fetch("site/index.html");
page.headers.get("Content-Type"); // "text/html; charset=utf-8"
```

A relative URL is relative to the working directory, and by default a session
can fetch only the files in it. `nodeTransport()` fetches `http:`, `https:`, and
`data:` URLs too.

## Responses

A file's response is a 200 with these headers:

| Header | Value |
| --- | --- |
| `Content-Type` | The type for the file's extension, if there is one |
| `Content-Length` | The file's size |
| `Last-Modified` | When the file last changed |

To add types for more extensions, or change one, use the `contentTypes` option:

```typescript
nodeTransport({ file: { contentTypes: { ts: "text/typescript" } } });
```

## Errors

As in a browser, a file the session can't read is a network error, not a 404.
`session.fetch` rejects with a `TypeError` when the file doesn't exist, the URL
is a directory, or the method isn't `GET` or `HEAD`.

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

## Symbolic links

A session follows a symbolic link, and the response's URL is the URL of the file it
points to. Relative references in the file resolve against where the file is,
not where the link is.

## Leave out file URLs

To fetch only `http:`, `https:`, and `data:` URLs on a server, use
`nodeTransport({ file: false })`, or `defaultTransport()`, which also works in
browsers.
