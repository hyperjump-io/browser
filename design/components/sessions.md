# `Hyperjump` and sessions (`src/hyperjump/hyperjump.js`)

State is separated by how long it lives.

| Level | Has |
| --- | --- |
| `Hyperjump` | Configuration: URI scheme and media type plugins, `allowRetrieval`, and (in the `http(s):` plugin) the HTTP cache |
| `Session` | A document cache, and browsing: `get`, `getDocument`, `step`, … |

- The long-lived level only has state that doesn't depend on a session.
  Plugins and HTTP responses are the same for every session.
- `hyperjump.session()` creates a session. There's no default session.
  Browsing is only on sessions, because a node needs its session to follow
  references.
- A session keeps each document it retrieves for as long as it's used. That
  gives each unit of work its own consistent set of documents, and a new
  session sees changes.
- The cache holds promises, so a document that's asked for again while it's
  being retrieved is only retrieved once. A failure isn't cached, so it can
  be tried again.
- A document is also cached under the URL its response came from, which can
  differ from the URI that was asked for (redirects, symlinks). References
  in it are relative to where it came from.
- Following a reference that leads back to a URI already in the chain is a
  `ReferenceCycleError`, rather than waiting forever.
- A session reads the context URI (`#context-uri`: the working directory
  in Node.js, the page in a browser) once, when it's created, and resolves
  relative URIs and its `allowRetrieval` against that. Everything a session
  does sees the same one, and a new session sees a change, like a new
  working directory or a page a single-page application navigated to.
  Before 2026-10-30, it was read deep inside `get`, `getDocument`, and
  `allowed-urls.js` each time. Reading it once for the `Hyperjump` was
  rejected, because a single-page application keeps one `Hyperjump` while
  its page changes.

## Configuring plugins

- URI scheme and media type plugins are only configured when a `Hyperjump`
  is created (`uriSchemePlugins` and `mediaTypePlugins`), with
  `allowRetrieval`. So `hyperjump.config` is all of its configuration, and
  nothing changes it later.
- The defaults come first, then the config's plugins in order, and a later
  plugin for a scheme or media type replaces an earlier one. Only the
  schemes a plugin lists are replaced, so one for `["https"]` leaves
  `http:` on the default, and an application never lists `file:` unless
  it changes it. That's what lets the defaults be different in Node.js and
  browsers. A replacement keeps the place of what it replaced, which is the
  order of the `Accept` header and which plugin wins a tie.
- Before 2026-10-30, plugins were added after a `Hyperjump` was created
  (`addUriSchemePlugin`, `addMediaTypePlugin`), and adding one for a scheme
  or media type that was supported replaced it. Changing the HTTP cache or
  headers meant knowing that, something that registered a plugin could
  replace one the application had, and the config was only part of the
  configuration.
  - Keeping `add*` for what isn't configured was rejected. It's two ways
    to configure plugins, and the config wouldn't be all of it.
  - `removeUriSchemePlugin` and `removeMediaTypePlugin` were for disabling
    a default. `allowRetrieval` makes that unnecessary: nothing is
    retrieved that isn't allowed, so the defaults are safe.
  - `setMediaTypeQuality` is a plugin's `quality` (see
    [Media types](media-types.md)).
  - Throwing on a duplicate was rejected. It protected against something
    registering over a plugin after the `Hyperjump` was created, which
    can't happen now. A subclass would have had to take out the
    application's plugins for its own media types before passing them on,
    and an application couldn't replace a subclass's plugin.
  - A `config.http` for the default HTTP plugin's options was rejected
    (see [HTTP cache](http-cache.md)).
- A URI scheme plugin for a scheme that maps to another URI, like `urn:`,
  retrieves that URI with `options.retrieve`. It's the `Hyperjump`'s
  retrieve, with the plugin for the URI's scheme and the `Accept` header.
  - It used to call `Hyperjump.retrieve`, which was public for that. A
    plugin in the config that calls `h.retrieve` refers to `h` in its own
    initializer, and TypeScript's `--strict` fails with TS7022 ("'h'
    implicitly has type 'any'"). Annotating the plugin's `retrieve` as
    returning `Promise<Response>` fixes it, but the error doesn't say so.
  - It's a function, like `accept`, not the `Hyperjump`, so a plugin
    still doesn't depend on it (see [Media types](media-types.md)).
- What only the library uses is private: `#retrieve`, `#parseResponse`,
  `#acceptableMediaTypes`, and `#getMediaType`. They used to be public
  because something inside the library needed them, which made them look
  like something an application calls. `Session` gets `#retrieve` and
  `#parseResponse` through module functions that `Hyperjump`'s static
  block sets. A static block can read the class's private methods, and the
  functions aren't exported. A `WeakMap` would do the same with something
  to keep in sync.
  - `fragmentPointer` is public. `getDocument` ignores the fragment, and
    `fragmentPointer` is what finds the node it identifies, according to
    the media type plugin that parsed the document. `@hyperjump/json-schema`
    uses it for documents from `getDocument` and for embedded ones that
    never came through it.
  - A subclass that got a `Response` from somewhere other than a URI
    scheme plugin can't use `parseResponse`. One that needs to calls its
    media type plugin's `parse`.

## Extending

Applications build on `Hyperjump` and `Session` by subclassing them.

- Methods are declared as methods, not function-valued properties, so a
  subclass can override them.
- A subclass with its own plugins, like `@hyperjump/json-schema`'s media
  types, puts them before the application's when it calls `super`, so the
  application can replace them:
  `super({ ...config, mediaTypePlugins: [schemaPlugin, ...config.mediaTypePlugins ?? []] })`.
- Every document lookup, including following references, goes through
  `getDocument`, so a subclass can find documents somewhere other than the
  cache or a URI scheme plugin. `getDocument` also returns the document
  itself, for what it has beyond its values.
- A media type plugin's `parse` gets the session the document is being
  retrieved in, so a media type that needs other resources to parse a
  document retrieves them in the same session.
- Types are generic over the node type, and documents over their node type,
  so a subclass's annotated trees are typed.
