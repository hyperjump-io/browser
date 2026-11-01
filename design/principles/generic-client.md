# A generic client

Browser is a generic hypermedia client. Applications build on it, by
plugins and subclasses, and it knows nothing about them.

- No application's concepts in the API or the docs. Embedding, anchors, and
  registries belong to the applications that have them. Media type plugins
  say what fragments identify (`fragmentPointer`), so documents don't have
  properties like `anchors` and `fragmentKind` that only one media type
  would use.
- A change for an application's sake has to make sense for any HTTP
  client, like giving a plugin the URL that was requested as well as the
  one a redirect ended at. Where it doesn't, the application finds another
  way, like overriding `getDocument`.
- What an application needs to extend is a method a subclass can override
  or a plugin it can add (see [Sessions](../components/sessions.md#extending)).
