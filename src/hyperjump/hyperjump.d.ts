import type { JsonNode } from "../json/jsonast.d.ts";
import type { JrefNode } from "../jref/jref-ast.d.ts";
import type { UriSchemePlugin } from "./uri-schemes/uri-scheme-plugin.d.ts";
import type { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.d.ts";
import type { JsonPointerError, jsonObjectHas, jsonObjectKeys, jsonValue } from "../json/jsonast-util.d.ts";
import type { HttpUriSchemePlugin } from "./uri-schemes/http-scheme-plugin.d.ts";
import type { FileUriSchemePlugin } from "./uri-schemes/file-scheme-plugin.d.ts";
import type { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.d.ts";
import type { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.d.ts";

export type HyperjumpConfig = {
  /**
   * What can be retrieved. Documents aren't trusted, so a reference
   * shouldn't be able to make the application retrieve whatever it names,
   * such as an internal address or a file outside the project. A URL it
   * refuses is a {@link RetrievalNotAllowedError}.
   *
   * It's a list of URLs. One that ends with `/` allows everything under it.
   * Any other allows only itself. A relative one is resolved against the
   * working directory in Node.js and the page in a browser. Where there's
   * nothing to resolve it against, such as in a worker, it throws.
   *
   * It's checked for everything a session retrieves, before the URI scheme
   * plugins, so a cached HTTP response isn't a way around it.
   *
   * In Node.js, `file:` URLs are compared by their real paths, so a symlink
   * can't lead outside an allowed directory. A file that doesn't exist is
   * compared by its path as it is. A response is checked again by the URL
   * it came from, so a redirect can't lead to a refused URL. The redirected
   * request is still sent, but its response isn't used.
   *
   * The default is `["./"]`: files in the working directory in Node.js, and
   * what's in the page's directory in a browser. To allow more, include it,
   * such as `["./", "https://api.example.com/"]`. `[]` allows nothing.
   *
   * A session can have its own (see {@link SessionOptions}), which it uses
   * instead.
   */
  allowRetrieval?: string[];
};

export type SessionOptions = {
  /**
   * What this session can retrieve, instead of the {@link Hyperjump}'s
   * `allowRetrieval` config. It replaces the config rather than adding to
   * it, so a session can allow less. To allow what the config allows too,
   * include its entries.
   */
  allowRetrieval?: string[];
};

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
  session(options?: SessionOptions): Session<T>;

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
   * implementing {@link UriSchemePlugin}s for URI schemes that don't
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
   * based on the extension and configured by {@link MediaTypePlugin}s.
   */
  getMediaType(uri: string): string;

  /**
   * Add support for a media type. Support for the
   * {@link JrefMediaTypePlugin | `JRef`} and
   * {@link JsonMediaTypePlugin | `JSON`} media types are enabled by
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
   * @throws An {@link UnsupportedMediaTypeError} if there is no plugin
   * registered for the media type.
   */
  setMediaTypeQuality(contentType: string, quality: number): void;

  /**
   * Parse a response with the media type plugin for its `Content-Type`, for
   * a session. The document's `mediaType` is set to the plugin's media type.
   *
   * @throws An {@link UnknownMediaTypeError} if the response doesn't have a
   * valid `Content-Type`.
   * @throws An {@link UnsupportedMediaTypeError} if there is no plugin
   * registered for the media type.
   */
  parseResponse(response: Response, session: Session<T>): Promise<DocumentNode<T>>;

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
  constructor(hyperjump: Hyperjump<T>, options?: SessionOptions);

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
   * @throws A {@link RetrievalNotAllowedError} if `allowRetrieval` refuses
   * the document's URL.
   * @throws A {@link RetrievalError} if a document can't be retrieved or
   * parsed. The cause is the error that prevented it.
   * @throws A {@link ReferenceCycleError} if following references leads back
   * to a reference that was already followed.
   * @throws A {@link JsonPointerError} if a fragment doesn't resolve to a
   * value.
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
   * @throws A {@link RetrievalError} if the document can't be retrieved or
   * parsed. The cause is the error that prevented it.
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
 * The `allowRetrieval` config refused a URL (see {@link HyperjumpConfig}).
 * It's distinct from a {@link RetrievalError}, which is for a URL that was
 * allowed and couldn't be retrieved. Tools use the difference: a refused URL
 * is unknown, and one that failed is missing.
 */
export class RetrievalNotAllowedError extends Error {
  /** The URL that was refused. For a redirect, it's where it led. */
  uri: string;

  constructor(uri: string, message?: string);
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
