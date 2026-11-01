import type { relativeFileUri } from "./file-uris.d.ts";
import type { JsonNode } from "../json/jsonast.d.ts";
import type { JrefNode } from "../jref/jref-ast.d.ts";
import type { UriSchemePlugin } from "./uri-schemes/uri-scheme-plugin.d.ts";
import type { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.d.ts";
import type { JsonPointerError, jsonObjectHas, jsonObjectKeys, jsonValue } from "../json/jsonast-util.d.ts";
import type { HttpUriSchemePlugin } from "./uri-schemes/http-scheme-plugin.d.ts";
import type { FileUriSchemePlugin } from "./uri-schemes/file-scheme-plugin.d.ts";
import type { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.d.ts";
import type { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.d.ts";

export type HyperjumpConfig<T extends JsonNode<{ type: string }> = JrefNode> = {
  /**
   * What can be retrieved. Documents aren't trusted, so a reference
   * shouldn't be able to make the application retrieve whatever it names,
   * such as an internal address or a file outside the project. A URL it
   * refuses is a {@link RetrievalNotAllowedError}.
   *
   * It's a list of URLs. One that ends with `/` allows everything under it.
   * Any other allows only itself. An origin, with or without the `/`, allows
   * everything on it, because it's the URL of its root. A relative one is resolved against the
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

  /**
   * Support for more
   * {@link https://www.rfc-editor.org/rfc/rfc3986#section-3.1 | URI schemes},
   * or different plugins for the ones that are supported by default:
   * {@link HttpUriSchemePlugin | `http(s):`} and, in Node.js,
   * {@link FileUriSchemePlugin | `file:`}. A plugin replaces the default,
   * or an earlier plugin in the list, for each scheme it lists, so one with
   * different HTTP caching or headers replaces the default for `http:` and
   * `https:`.
   */
  uriSchemePlugins?: UriSchemePlugin[];

  /**
   * Support for more media types, or different plugins for the ones that are
   * supported by default: {@link JrefMediaTypePlugin | JRef} and
   * {@link JsonMediaTypePlugin | JSON}. A plugin replaces the default, or an
   * earlier plugin in the list, for its media type, and takes its place in
   * the `Accept` header. The `Accept` header lists the media types in that
   * order, with each plugin's `quality`.
   */
  mediaTypePlugins?: MediaTypePlugin<DocumentNode<T>>[];
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
  /**
   * Plugins are only configured here, so a `Hyperjump`'s configuration
   * doesn't change after it's created.
   */
  constructor(config?: HyperjumpConfig<T>);

  /**
   * The config it was created with. It's a frozen copy, with frozen copies
   * of its lists, so changing the object it was created with doesn't
   * change it.
   */
  readonly config: HyperjumpConfig<T>;

  /**
   * Start a session. Each session has its own documents, so nothing one
   * session retrieves is seen by another, except through the URI scheme
   * plugins (such as an HTTP cache).
   */
  session(options?: SessionOptions): Session<T>;

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
   * browser, the base URI is the URI of the page. It's the one there was when
   * the session was created.
   *
   * @see Use the `uriSchemePlugins` config ({@link HyperjumpConfig}) to add
   * support for additional URI schemes.
   * @see Support for {@link JrefMediaTypePlugin | JRef} and
   * {@link JsonMediaTypePlugin | JSON} is built in. Use the
   * `mediaTypePlugins` config ({@link HyperjumpConfig}) to add support for
   * additional media types.
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

/**
 * A URL that was allowed couldn't be retrieved. Its message says the URL
 * with {@link relativeFileUri}, so it doesn't reveal where files are.
 */
export class RetrievalError extends Error {
  /** The URL that couldn't be retrieved */
  uri: string;

  constructor(uri: string, options: { cause: unknown });
}

/**
 * There's no file at a `file:` URL, or something in its path isn't a
 * folder. Its message says the URL with {@link relativeFileUri}, rather
 * than Node.js's error, which says the absolute path. It's the cause of a
 * {@link RetrievalError}.
 */
export class FileNotFoundError extends Error {
  /** The URL of the file */
  uri: string;

  constructor(uri: string);
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

  /**
   * The message says which list to change, the config's or a session's
   * own, so it's given rather than made from the URL.
   */
  constructor(uri: string, message: string);
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
  /** The URI scheme that isn't supported, without the `:` */
  scheme: string;

  constructor(scheme: string, message?: string);
}

/**
 * No media type plugin can parse a response, because it doesn't have a
 * `Content-Type`, its `Content-Type` isn't valid, or no plugin supports it.
 * It's the cause of a {@link RetrievalError}.
 */
export class UnsupportedMediaTypeError extends Error {
  /** The response's media type, or `undefined` if it doesn't have a valid one */
  mediaType: string | undefined;

  constructor(mediaType: string | undefined, message?: string);
}
