# File URLs

On a server, a session can fetch `file:` URLs the way a browser opens files. Use
`nodeTransport()` as the bottom of your stack:

```typescript
import { Session, nodeTransport } from "@hyperjump/browser";
import { pathToFileURL } from "node:url";

const session = new Session(nodeTransport({ file: { root: "./site" } }), {
  baseURL: pathToFileURL("./site/")
});

const page = await session.fetch("index.html");
page.headers.get("Content-Type"); // "text/html; charset=utf-8"
```

`nodeTransport()` fetches `http:`, `https:`, and `data:` URLs too.

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

As in a browser, a file that can't be read is a network error, not a 404.
`session.fetch` rejects with a `TypeError` when the file doesn't exist, the URL
is a directory, or the method isn't `GET` or `HEAD`.

## Limit what can be read

A document can refer to any file on the machine. If your application fetches
URLs that come from documents, use the `root` option so only files in that
directory can be read:

```typescript
nodeTransport({ file: { root: "./site" } });
```

A URL outside `root` is a network error. A symbolic link inside `root` that
points outside it can still be read, so don't rely on `root` for a directory
where someone you don't trust can make links.

## Leave out file URLs

To fetch only `http:`, `https:`, and `data:` URLs on a server, use
`nodeTransport({ file: false })`, or `defaultTransport()`, which also works in
browsers.
