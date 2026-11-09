# A generic client

Browser is a generic hypermedia client. Applications build on it, by
plugins, layers, and subclasses, and it knows nothing about them.

- No application's concepts in the API or the docs. Anchors and registries
  belong to the applications that have them. A document that contains
  documents is generic: a media type plugin says which ones it contains
  (`embedded`), and Browser only finds them. Media type plugins
  say what fragments identify (`fragmentPointer`), so documents don't have
  properties like `anchors` and `fragmentKind` that only one media type
  would use.
- A change for an application's sake has to make sense for any HTTP
  client, like giving a plugin the URL that was requested as well as the
  one a redirect ended at. Where it doesn't, the application finds another
  way, like a layer.
- Retrieval is extended with layers, like the web's layered system. A layer
  sees only the request and the response, so it can answer with what an
  application has, like a registry, or change what's requested, without
  Browser knowing why (see [Layers](../components/layers.md)).
- What an application needs to extend is a layer it adds, a method a
  subclass can override, or a plugin it can add (see
  [Sessions](../components/sessions.md#extending)).
