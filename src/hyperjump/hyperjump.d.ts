import type { relativeFileUrl } from "./file-urls.d.ts";
import type { JsonNode } from "../json/jsonast.d.ts";
import type { JrefNode } from "../jref/jref-ast.d.ts";
import type { UrlSchemePlugin } from "./url-schemes/url-scheme-plugin.d.ts";
import type { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.d.ts";
import type { JsonPointerError } from "../json/jsonast-util.d.ts";
import type { HttpUrlSchemePlugin } from "./url-schemes/http-scheme-plugin.d.ts";
import type { FileUrlSchemePlugin } from "./url-schemes/file-scheme-plugin.d.ts";
import type { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.d.ts";
import type { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.d.ts";
import type { FollowedNode, jrefStep } from "./browsing.d.ts";
import type { HttpCacheStore } from "./url-schemes/http-cache-store.d.ts";
import type { HttpCache } from "./http-cache.d.ts";

export type HyperjumpConfig<T extends JsonNode<{ type: string }> = JrefNode> = {
  /**
   * What can be retrieved. Documents aren't trusted, so a reference
   * shouldn't be able to make the application retrieve whatever it names,
   * such as an internal address or a file outside the project. A URL it
   * refuses is a {@link RetrievalError} whose cause is an {@link HttpError}
   * for a `403`, with a message that says which list to change.
   *
   * It's a list of URLs. One that ends with `/` allows everything under it.
   * Any other allows only itself. An origin, with or without the `/`, allows
   * everything on it, because it's the URL of its root. A relative one is resolved against the
   * working directory in Node.js and the page in a browser. Where there's
   * nothing to resolve it against, such as in a worker, it throws a
   * `TypeError`, and so does one that isn't a URL.
   *
   * It's checked for everything a session retrieves, before the URL scheme
   * plugins, so a cached HTTP response isn't a way around it.
   *
   * In Node.js, `file:` URLs are compared by their real paths, so a symlink
   * can't lead outside an allowed directory. A file that doesn't exist is
   * compared by its path as it is. A redirect is checked before it's
   * followed, so a refused URL isn't requested. In a browser, `fetch`
   * follows redirects itself, so the redirected request is still sent, but
   * a response from a refused URL isn't used.
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
   * {@link https://url.spec.whatwg.org/#concept-url-scheme | URL schemes},
   * or different plugins for the ones that are supported by default:
   * {@link HttpUrlSchemePlugin | `http(s):`} and, in Node.js,
   * {@link FileUrlSchemePlugin | `file:`}. A plugin replaces the default,
   * or an earlier plugin in the list, for each scheme it lists.
   */
  urlSchemePlugins?: UrlSchemePlugin[];

  /**
   * Support for more media types, or different plugins for the ones that are
   * supported by default: {@link JrefMediaTypePlugin | JRef} and
   * {@link JsonMediaTypePlugin | JSON}. A plugin replaces the default, or an
   * earlier plugin in the list, for its media type, and takes its place in
   * the `Accept` header. The `Accept` header lists the media types in that
   * order, with each plugin's `quality`.
   */
  mediaTypePlugins?: MediaTypePlugin<DocumentNode<T>>[];

  /**
   * URLs whose responses get the media type of their URL's extension, for
   * servers that send a missing or wrong `Content-Type`, like GitHub raw
   * URLs, which are `text/plain`. A URL that ends with `/` is for everything
   * under it, and any other is only for itself, like an `allowRetrieval`
   * URL. It's matched by the URL a response came from, after any redirects,
   * and the extension is its path's, without the query. A response whose
   * extension no media type plugin has keeps the `Content-Type` it has. A
   * URL has to be absolute, or the constructor throws.
   *
   * A file doesn't have a media type, so a `file:` response always gets its
   * extension's.
   */
  mediaTypeByExtension?: string[];

  /**
   * Headers to send with requests, such as credentials, by URL. A URL that
   * ends with `/` gets its headers for everything under it. Any other gets
   * them only for itself. An origin, with or without the `/`, gets them for
   * everything on it, because it's the URL of its root. Only the URLs listed
   * get headers, because documents can reference any URL. A URL has to be
   * absolute, or the constructor throws.
   *
   * A value can be a {@link HeadersFunction}, to refresh a token for
   * example. When more than one URL matches, their headers are merged, and
   * a longer URL's headers win. The `Accept` header is always the one for
   * the media type plugins.
   *
   * A redirect is followed by the session, so the request it leads to gets
   * the headers for its own URL. In a browser, `fetch` follows redirects
   * itself and sends the same headers, except `Authorization` and `Cookie`
   * on a redirect to another origin.
   *
   * The HTTP cache is private, so a response retrieved with credentials is
   * used for any later request for the same URL that it satisfies,
   * including ones the headers would be different for, unless the response
   * has a `Vary` for them. Different credentials for the same URL need
   * `Hyperjump`s whose HTTP plugins don't share a cache.
   */
  headers?: Record<string, HeadersInit | HeadersFunction>;

  /**
   * Where to cache `http:` and `https:` responses, according to their
   * caching headers (RFC 9111, as a private cache). A stale response is
   * revalidated when it has an `ETag` or `Last-Modified`. Every session
   * shares it, and concurrent requests for the same URL share one request.
   *
   * Without one, it's the environment's default: a new memory store in
   * Node.js, and none in a browser, where `fetch` already caches. `false`
   * doesn't cache.
   */
  httpCache?: HttpCacheStore | false;
};

/**
 * Headers for a request, called with the URL that's requested, without its
 * fragment. It can be async.
 */
export type HeadersFunction = (url: URL) => HeadersInit | undefined | Promise<HeadersInit | undefined>;

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
  /**
   * The URL of the document with the reference that's being followed. It's
   * the request's `Referer`.
   */
  referencedFrom?: string;

  /**
   * The document the reference that's being followed is in. A document
   * embedded in it, or embedded with it, is found before anything is
   * retrieved (see {@link DocumentNode.embedded}).
   */
  referencedIn?: DocumentNode<any>;
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
   * The URL scheme plugins by scheme: the defaults, with the config's
   * replacing them for the schemes they list. This, `mediaTypePlugins`,
   * `accept`, and `httpCache` are what the `Hyperjump` resolved from its
   * config, which its sessions retrieve and parse with.
   */
  readonly urlSchemePlugins: ReadonlyMap<string, UrlSchemePlugin>;

  /**
   * The media type plugins by media type, in the order of the `Accept`
   * header: the defaults, with the config's replacing them for their media
   * types or coming after them.
   */
  readonly mediaTypePlugins: ReadonlyMap<string, MediaTypePlugin<DocumentNode<T>>>;

  /**
   * The `Accept` header that's given to URL scheme plugins. It's built when
   * the `Hyperjump` is created, so changing a plugin's `quality` later
   * doesn't change it.
   */
  readonly accept: string;

  /**
   * The HTTP cache every session shares, from the `httpCache` config, or
   * `undefined` when nothing's cached
   */
  readonly httpCache: HttpCache | undefined;

  /**
   * Start a session. Each session has its own documents, so nothing one
   * session retrieves is seen by another, except through the URL scheme
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
 *
 * Browse from the node {@link Session.get} returns with the `jref*`
 * functions, such as {@link jrefStep}, which take the session to follow
 * references with.
 */
export class Session<T extends JsonNode<{ type: string }> = JrefNode> {
  constructor(hyperjump: Hyperjump<T>, options?: SessionOptions);

  readonly hyperjump: Hyperjump<T>;

  /**
   * Retrieve a document located at the given URL. A URL can be relative if
   * there's a base URL to resolve it against. In Node.js, it's the working
   * directory. In a browser, it's the URL of the page. It's the one there was
   * when the session was created.
   *
   * @see Use the `urlSchemePlugins` config ({@link HyperjumpConfig}) to add
   * support for additional URL schemes.
   * @see Support for {@link JrefMediaTypePlugin | JRef} and
   * {@link JsonMediaTypePlugin | JSON} is built in. Use the
   * `mediaTypePlugins` config ({@link HyperjumpConfig}) to add support for
   * additional media types.
   *
   * @throws A `TypeError` if `url` isn't a URL, or `referencedFrom` isn't an
   * absolute URL.
   * @throws A `TypeError` if `url` is relative and there's nothing to
   * resolve it against, such as in a worker.
   * @throws A {@link RetrievalError} if a document can't be retrieved or
   * parsed. The cause is the error that prevented it, like an
   * {@link HttpError} for a `403` when `allowRetrieval` refuses its URL, or
   * a `TypeError` when `allowRetrieval` is the default and there's nothing
   * to resolve it against.
   * @throws A {@link ReferenceCycleError} if following references leads back
   * to a reference that was already followed.
   * @throws A {@link JsonPointerError} if a fragment doesn't resolve to a
   * value.
   */
  get(url: string, options?: GetOptions): Promise<FollowedNode<T>>;

  /**
   * Retrieve the document located at the given URL, the same way
   * {@link Session.get} does, but return the document itself rather than a
   * node in it. The fragment is ignored and references aren't followed. Use it
   * for what the document has beyond its values, such as its parse status.
   *
   * Every document {@link Session.get} uses comes from this method, including
   * the ones it follows references to. A subclass finds documents somewhere
   * other than a URL scheme plugin with a layer on {@link Session.fetch}.
   *
   * @throws A `TypeError` if `url` isn't a URL, or `referencedFrom` isn't an
   * absolute URL.
   * @throws A `TypeError` if `url` is relative and there's nothing to
   * resolve it against, such as in a worker.
   * @throws A {@link RetrievalError} if the document can't be retrieved or
   * parsed. The cause is the error that prevented it.
   */
  getDocument(url: string, options?: GetOptions): Promise<DocumentNode<T>>;

  /**
   * Everything the session retrieves is requested with this method: its
   * stack, which checks `allowRetrieval`, down to the URL scheme plugins. It
   * doesn't follow redirects. The session follows them with a new request
   * to this method, so each URL a redirect leads to goes through it.
   *
   * A subclass adds a layer on top of the session's by overriding it, to
   * answer from documents it has, for example. A layer it adds answers
   * before `allowRetrieval`, so what it answers with doesn't have to be
   * allowed.
   *
   * ```js
   * fetch(request) {
   *   return myLayer((request) => super.fetch(request))(request);
   * }
   * ```
   */
  fetch(request: Request): Promise<Response>;
}

/**
 * A URL that was allowed couldn't be retrieved. Its message says the URL
 * with {@link relativeFileUrl}, so it doesn't reveal where files are.
 */
export class RetrievalError extends Error {
  /** The URL that couldn't be retrieved */
  url: string;

  constructor(url: string, options: { cause: unknown });
}

/**
 * There's no file at a `file:` URL, or something in its path isn't a
 * folder. Its message says the URL with {@link relativeFileUrl}, rather
 * than Node.js's error, which says the absolute path. It's the cause of a
 * {@link RetrievalError}.
 */
export class FileNotFoundError extends Error {
  /** The URL of the file */
  url: string;

  constructor(url: string);
}

/**
 * A response the session can't parse, like a server's `404` or a refusal by
 * `allowRetrieval`, which is a `403`. Its message says the status, and the
 * response's Problem Details `detail` if it has one, like which
 * `allowRetrieval` to change. It's the cause of a {@link RetrievalError}.
 */
export class HttpError extends Error {
  /** The response, whose body has been read or cancelled */
  response: Response;

  constructor(response: Response, message?: string);
}

/**
 * Thrown when following references leads back to a reference that was already
 * followed, so the references never resolve to a value.
 */
export class ReferenceCycleError extends Error {
  referenceChain: string[];

  constructor(referenceChain: string[]);
}

export class UnsupportedUrlSchemeError extends Error {
  /** The URL scheme that isn't supported, without the `:` */
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
