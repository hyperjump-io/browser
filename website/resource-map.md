# Resource map

Some documents contain other documents, each with a URL of its own, like a web
bundle. When your code parses one, it can register the documents it finds in
it. After that, requests that the document causes for those URLs are answered
from the map instead of fetched:

```typescript
import { Session, compose, resourceMap, findLayer, ResourceMap, defaultTransport } from "@hyperjump/browser";

const stack = compose(resourceMap())(defaultTransport());
const session = new Session(stack, { baseURL: "https://example.com/" });
const map = findLayer(stack, ResourceMap);

const response = await session.fetch("https://example.com/bundle.json");
const bundle = await response.json();
for (const [url, document] of Object.entries(bundle.documents)) {
  map?.register(response, url, JSON.stringify(document), { value: document });
}

// Answered from the map, because the bundle caused the request
const address = await session.fetch("https://example.com/address.json", {
  initiator: response
});
```

Put the resource map at the top of your stack, so it finds what a document says
it contains before anything else does.

## Who gets a document's resources

A resource answers only requests that the document containing it causes. Say
what caused a request with the `initiator` option: the response of the
document that has the reference, or its record.

- A request without an `initiator` is fetched as usual.
- A request from a resource the map answered gets the other resources in the
  same document. Register resources nested in one in its response, and they're
  in the same document too.
- A request from a document that was fetched, even one the bundle refers to,
  doesn't get the bundle's resources.
- Each response is a document of its own. If you fetch the same URL twice, each
  response has its own resources.

So a document can say it contains a document with any URL without changing
what any other document gets. That's how a web bundle works too: what it
contains answers only for the page that loaded it.

The resources are gone when the session that fetched the document is.

## The parsed value

Pass the parsed form of a resource as `value`. A response from the map has it
as `responseMeta(response).value`, so you can use the same object instead of
parsing the text again.

## Conflicts

Registering the same content for a URL again does nothing and returns `false`.
Registering different content for a URL the document already has throws an
error. Two documents can each have a resource with the same URL and different
content.

## Resources for every request

To answer every request in a session with a document, no matter what caused it,
put it in the [registry](registry.md) when you build the stack.
