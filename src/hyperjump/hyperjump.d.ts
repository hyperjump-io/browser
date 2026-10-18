import type { JsonNode } from "../json/jsonast.d.ts";
import type { JrefNode } from "../jref/jref-ast.d.ts";
import type { UriSchemePlugin } from "./uri-schemes/uri-scheme-plugin.d.ts";
import type { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.d.ts";
import type { jsonObjectHas, jsonObjectKeys, jsonValue } from "../json/jsonast-util.d.ts";

export type HyperjumpConfig = object;

export type GetOptions = {
  referencedFrom?: string;
};

export class Hyperjump<T extends JsonNode<{ type: string }> = JrefNode> {
  constructor(config?: HyperjumpConfig);

  /**
   * Start a session. Each session has its own documents, so nothing one
   * session retrieves is seen by another, except through the URI scheme
   * plugins (such as an HTTP cache).
   */
  session(): Session<T>;

  /**
   * Add support for a
   * {@link https://www.rfc-editor.org/rfc/rfc3986#section-3.1 | URI scheme}.
   * Support for the {@link HttpUriSchemePlugin | `http(s):`} and
   * {@link FileUriSchemePlugin | `file:`} URI schemes are enabled by default.
   */
  addUriSchemePlugin(plugin: UriSchemePlugin): void;

  /**
   * This is mostly useful for disabling a scheme that's enabled by default.
   */
  removeUriSchemePlugin(scheme: string): void;

  /**
   * Unless you're using it in a {@link UriSchemePlugin.retrieve} method, this
   * is not the method you're looking for. It's used internally to fetch a
   * resource before processing it based on its media type. You might use it for
   * implementing {@link hyperjump.UriSchemePlugin}s for URI schemes that don't
   * have locating semantics (such as `urn:`) and instead map to another URI
   * where the resource can be retrieved from. See the example in the README.
   */
  retrieve(uri: string, options: GetOptions): Promise<Response>;

  /**
   * Constructs an `Accept` header based on the registered media types.
   */
  acceptableMediaTypes(): string;

  /**
   * Returns the media type of the resource based on its URI. This is usually
   * based on the extension and configured by {@link hyperjump.MediaTypePlugin}s.
   */
  getMediaType(uri: string): string;

  /**
   * Add support for a media type. Support for the
   * {@link hyperjump.JrefMediaTypePlugin | `JRef`} and
   * {@link hyperjump.JsonMediaTypePlugin | `JSON`} media types are enabled by
   * default.
   */
  addMediaTypePlugin<A extends DocumentNode<T>>(plugin: MediaTypePlugin<A>): void;

  /**
   * This is mostly useful for disabling a media type that's enabled by default.
   */
  removeMediaTypePlugin(contentType: string): void;

  /**
   * Set the
   * {@link https://developer.mozilla.org/en-US/docs/Glossary/Quality_values | quality}
   * that will be used in the Accept header of requests to indicate to servers
   * which media types are preferred over others.
   *
   * @throws {@link UnsupportedMediaTypeError} if there is no plugin registered
   * for the media type.
   */
  setMediaTypeQuality(contentType: string, quality: number): void;

  /**
   * Parse a response with the media type plugin for its `Content-Type`. The
   * document's `mediaType` is set to the plugin's media type.
   *
   * @throws {@link UnknownMediaTypeError}
   * @throws {@link UnsupportedMediaTypeError}
   */
  parseResponse(response: Response): Promise<DocumentNode<T>>;

  /**
   * The JSON Pointer a fragment identifies in a document, according to the
   * media type plugin that parsed it. It's `""` (the whole document) for a
   * media type that doesn't define fragments.
   */
  fragmentPointer(document: DocumentNode<T>, fragment: string): string;
}

/**
 * Retrieves documents and follows references. A session caches every
 * document it retrieves for as long as it's used, so start a new session to
 * see changes. Create one with {@link Hyperjump.session}.
 */
export class Session<T extends JsonNode<{ type: string }> = JrefNode> {
  constructor(hyperjump: Hyperjump<T>);

  readonly hyperjump: Hyperjump<T>;

  /**
   * Retrieve a document located at the given URI. URIs can be relative if a
   * base URI can be determined. On the server-side, the base URI is the CWD. In
   * browser, the base URI is the URI of the page.
   *
   * @see Use {@link Hyperjump.addUriSchemePlugin} to add support for additional
   * URI schemes.
   * @see Support for {@link JrefMediaTypePlugin | JRef} and
   * {@link JsonMediaTypePlugin | JSON} is built in. Use
   * {@link Hyperjump.addMediaTypePlugin} to add support for additional media
   * types.
   *
   * @throws {@link RetrievalError}
   * @throws {@link ReferenceCycleError}
   * @throws {@link json.JsonPointerError}
   */
  get(uri: string, options?: GetOptions): Promise<T>;

  /**
   * Retrieve the document located at the given URI, the same way
   * {@link Session.get} does, but return the document itself rather than a
   * node in it. The fragment is ignored and references aren't followed. Use it
   * for what the document has beyond its values, such as its parse status.
   *
   * Every document {@link Session.get} uses comes from this method, including
   * the ones it follows references to, so a subclass can override it to find
   * documents somewhere other than the session or a URI scheme plugin.
   *
   * @throws {@link RetrievalError}
   */
  getDocument(uri: string, options?: GetOptions): Promise<DocumentNode<T>>;

  /**
   * The value of a node that isn't an array or object.
   *
   * @throws Error for an array or object. Getting their value would need to
   * follow the references in them.
   */
  value: typeof jsonValue;
  has: typeof jsonObjectHas;

  /**
   * This is like indexing into an object or array. It will follow any
   * references it encounters so it always returns a JSON compatible value.
   */
  step(key: string, node: T): Promise<T>;

  /**
   * Iterate over an array node. It will follow any references it encounters so
   * it always yields JSON compatible values.
   */
  iter(node: T): AsyncGenerator<T, void, unknown>;

  keys: typeof jsonObjectKeys;

  /**
   * Iterate over the values of an object. It will follow any references it
   * encounters so it always yields JSON compatible values.
   */
  values(node: T): AsyncGenerator<T, void, unknown>;

  /**
   * Iterate over key/value pairs of an object. It will follow any references it
   * encounters so it always yields JSON compatible values.
   */
  entries(node: T): AsyncGenerator<[string, T], void, unknown>;
}

export class RetrievalError extends Error {
  constructor(message: string, options: { cause: unknown });
}

/**
 * Thrown when following references leads back to a reference that was already
 * followed, so the references never resolve to a value.
 */
export class ReferenceCycleError extends Error {
  referenceChain: string[];

  constructor(referenceChain: string[]);
}

export class UnsupportedUriSchemeError extends Error {
  constructor(scheme: string, message?: string);
}

export class UnsupportedMediaTypeError extends Error {
  mediaType: string;

  constructor(mediaType: string, message?: string);
}

export class UnknownMediaTypeError extends Error {
  constructor(message?: string);
}
