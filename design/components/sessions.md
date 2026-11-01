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
  Reading it each time it's needed, deep inside `get`, `getDocument`, and
  `allowed-urls.js`, was rejected because one session could see two.
  Reading it once for the `Hyperjump` was
  rejected, because a single-page application keeps one `Hyperjump` while
  its page changes.
  - Taking only absolute URLs, like Node.js's `fetch`, so that Browser
    never reads it, was rejected. The default `allowRetrieval`, `["./"]`,
    needs something to be relative to, so the default would have to allow
    nothing. Every application would turn paths into URLs itself, and
    `@hyperjump/json-schema` and the `hyperjump` CLI would read the working
    directory instead, so it would only move.
  - A `baseUri` session option is left out until something needs it. The
    session would still read the context URI for the default, so it adds
    an option without taking anything away. It's for a process whose
    working directory isn't the project, like a language server for a
    workspace, or a CLI with a `--cwd` that would otherwise allow `./`
    from the process's working directory.

## Configuring plugins

- URI scheme and media type plugins are only configured when a `Hyperjump`
  is created (`uriSchemePlugins` and `mediaTypePlugins`), with
  `allowRetrieval`. So `hyperjump.config` is all of its configuration, and
  nothing changes it later.
  - It's a frozen copy of the config, with frozen copies of its lists.
    Otherwise, changing the object the `Hyperjump` was created with would
    change what new sessions allow, without the check the constructor
    does, and changing its plugins would do nothing, because they're read
    once. A subclass's own config,
    like `@hyperjump/json-schema`'s `dialects`, is copied but its lists
    aren't, because only the subclass knows what they are.
- The defaults come first, then the config's plugins in order, and a later
  plugin for a scheme or media type replaces an earlier one. Only the
  schemes a plugin lists are replaced, so one for `["https"]` leaves
  `http:` on the default, and an application never lists `file:` unless
  it changes it. That's what lets the defaults be different in Node.js and
  browsers. A replacement keeps the place of what it replaced, which is the
  order of the `Accept` header and which plugin wins a tie.
  - The defaults are always created, even when the config replaces them.
    Creating only the ones that aren't replaced was rejected. The
    `Hyperjump` would need each default's schemes before creating it, in
    a table to keep in sync with the plugins, and a default whose schemes
    are only partly replaced is still needed. A `Hyperjump` takes about
    0.5 µs to create in Node.js, the same whether the HTTP plugin is
    replaced or not (measured 2026-10-31).
- Adding plugins after a `Hyperjump` is created (`addUriSchemePlugin`,
  `addMediaTypePlugin`) was rejected. Adding one for a scheme or media type
  that's supported would replace it, so changing the HTTP cache or headers
  would mean knowing that. Something that registered a plugin could
  replace one the application had, and the config would only be part of
  the configuration.
  - `add*` beside the config, for what isn't configured, was rejected.
    It's two ways to configure plugins, and the config wouldn't be all of
    it.
  - Removing plugins (`removeUriSchemePlugin`, `removeMediaTypePlugin`) to
    disable a default isn't needed. Nothing is retrieved that
    `allowRetrieval` doesn't allow, so the defaults are safe.
  - Changing a plugin's quality is configuring a plugin with another
    `quality` (see [Media types](media-types.md)).
  - Throwing on a duplicate was rejected. It would protect against
    something registering over a plugin after the `Hyperjump` is created,
    which can't happen. A subclass would have to take out the
    application's plugins for its own media types before passing them on,
    and an application couldn't replace a subclass's plugin.
  - A `config.http` for the default HTTP plugin's options was rejected
    (see [HTTP cache](http-cache.md)).
- A URI scheme plugin for a scheme that maps to another URI, like `urn:`,
  returns a redirect to it, which the session follows (see
  [Redirects](redirects.md)).
  - A public `Hyperjump.retrieve` for the plugin to call was rejected. A
    plugin in the config that calls `h.retrieve` refers to `h` in its own
    initializer, and TypeScript's `--strict` fails with TS7022 ("'h'
    implicitly has type 'any'"). Annotating the plugin's `retrieve` as
    returning `Promise<Response>` fixes it, but the error doesn't say so.
    An `options.retrieve` was rejected too (see [Redirects](redirects.md)).
- A `Hyperjump` is what it resolved from its config: its plugins by scheme
  and by media type (`uriSchemePlugins`, `mediaTypePlugins`) and the
  `Accept` header (`accept`), as read-only properties. A session retrieves
  and parses with them. What's worked out from the media type plugins, like
  the plugin for a `Content-Type` or the media type of an extension, is
  pure functions of them (`media-type-plugins.js`), so they're tested
  without retrieving anything.
  - The functions aren't exported from the package, because their
    signatures are how a `Hyperjump` keeps its plugins. URI scheme plugins
    get what they need from them as values (`options.accept` and
    `options.mediaTypeByExtension`).
  - The resolved plugins are public because `Session` is another class and
    can't read a `Hyperjump`'s private fields. They're the instances the
    config already has, so nothing more is exposed. They're `ReadonlyMap`s
    in the types, but a `Map` can still be changed, like a plugin in the
    config.
  - Keeping retrieval and parsing as private methods of `Hyperjump` was
    rejected. `Session` would need a way to call them that isn't the
    API, like module functions set in a static block, and the functions of
    the plugins could only be tested through a session.
  - A `Hyperjump` that's only a plain object from a factory was rejected.
    `@hyperjump/json-schema`'s `JsonSchema` subclasses it for its own config
    and its own session, which a class does well. A `Session` that built
    its own plugins from `hyperjump.config` was rejected because it would
    create the default plugins for each session, which wouldn't share the
    HTTP cache.
  - `fragmentPointer` is a method. `getDocument` ignores the fragment, and
    `fragmentPointer` is what finds the node it identifies, according to
    the media type plugin that parsed the document. `@hyperjump/json-schema`
    uses it for documents from `getDocument` and for embedded ones that
    never came through it.
  - A subclass that got a `Response` from somewhere other than a URI
    scheme plugin calls its media type plugin's `parse`.

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
  - Seeding a session with documents (`SessionOptions.documents`) instead
    was rejected. `@hyperjump/json-schema`'s lookups aren't documents it
    already has. An embedded resource is only found by a reference from
    the document it's in, so it depends on `referencedFrom`. A registry's
    schemas are identified and resolved the first time they're needed,
    which can retrieve a meta-schema in the session, so sessions stay
    cheap to create. Every document it gets, retrieved or not, is also
    checked against the others for a duplicate identifier.
  - A lookup function in the session's options
    (`findDocument(uri, options, next)`) was rejected. It's the override
    passed as a function, and it takes nothing away: a subclass still
    adds its own methods.
- A media type plugin's `parse` gets the session the document is being
  retrieved in, so a media type that needs other resources to parse a
  document retrieves them in the same session.
- Types are generic over the node type, and documents over their node type,
  so a subclass's annotated trees are typed.
