# Resource map

Some documents contain other documents, each with a URL of its own, like a
bundle. When your code parses one, it can register the documents it finds in a
resource map. After that, the map answers requests in the same session for
those URLs instead of fetching them:

```typescript
import { Session, compose, resourceMap, findLayer, ResourceMap, defaultTransport } from "@hyperjump/browser";

const stack = compose(resourceMap())(defaultTransport());
const session = new Session(stack);
const map = findLayer(stack, ResourceMap);

const bundle = await (await session.fetch("https://example.com/bundle.json")).json();
for (const [url, document] of Object.entries(bundle.documents)) {
  map?.register(session, url, JSON.stringify(document), { value: document });
}

// Answered from the map
const response = await session.fetch("https://example.com/address.json");
```

Put the resource map at the top of your stack, so it finds what a document says
it contains before anything else does.

## What each session gets

A resource map keeps what's registered for each session, and it's gone when the
session is:

- A child session gets what its parents registered, the way a frame can use
  what its page found.
- A parent doesn't get what its children registered, and children don't get
  each other's. To register something for every frame, register it in
  `session.root`.

To keep every session to what it registered itself, use
`resourceMap({ inherit: false })`.

## The parsed value

Pass the parsed form of a resource as `value`. A response from the map has it
as `responseMeta(response).value`, so you can use the same object instead of
parsing the text again.

## Conflicts

Registering the same content for a URL again does nothing and returns `false`.
Registering different content for a URL the session already has throws an
error. A child session can register a URL its parent has, and then the child
gets its own.

## Documents you don't trust

What a session registers answers every request in that session. A document can
say it contains a document with any URL, including one that your app
fetches for something else. If you load documents you don't trust, only
register what's safe, or load untrusted documents in a separate session.
