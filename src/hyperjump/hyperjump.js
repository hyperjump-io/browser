import { assertIri, assertIriReference, hasScheme, isIri, normalizeIri, parseIri, resolveIri, toAbsoluteIri, urlToIri } from "@hyperjump/uri";
import { contextUri } from "#context-uri";
import { defaultUriSchemePlugins } from "#default-uri-scheme-plugins";
import { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.js";
import { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.js";
import { jsonPointerGet } from "../json/jsonast-util.js";
import { acceptHeader, fragmentPointer, mediaTypeByExtension, mediaTypePluginFor } from "./media-type-plugins.js";
import { AllowedUrls, configSource, resolveAllowRetrieval, sessionSource } from "./allowed-urls.js";
import { relativeFileUri } from "./file-uris.js";
import { documentUriOf } from "./uri-parts.js";

/**
 * @import { AbsoluteIri, Iri, IriReference, NormalizedIri } from "@hyperjump/uri"
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { UriSchemePlugin } from "./uri-schemes/uri-scheme-plugin.d.ts"
 * @import { DocumentNode, MediaTypePlugin, RetrievedResponse } from "./media-types/media-type-plugin.d.ts"
 * @import { FollowedNode } from "./browsing.d.ts"
 * @import * as API from "./hyperjump.d.ts"
 * @import { RetrieveOptions } from "./uri-schemes/uri-scheme-plugin.d.ts"
 */

/** @typedef {Omit<RetrieveOptions, "accept" | "mediaTypeByExtension">} CheckedGetOptions */

/**
 * Redirects are followed this many times, like `fetch` does, so a redirect
 * cycle fails instead of going on forever
 */
const maxRedirects = 20;

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/**
 * @class
 * @implements API.Hyperjump<JrefNode>
 */
export class Hyperjump {
  /** @type API.HyperjumpConfig */
  #config;

  /**
   * Plugins by scheme. A `Map`, not an object, so a scheme like
   * `constructor` isn't found on its prototype.
   *
   * @type Map<string, UriSchemePlugin>
   */
  #uriSchemePlugins;

  /** @type Map<string, MediaTypePlugin<DocumentNode>> */
  #mediaTypePlugins;

  /**
   * The `Accept` header for the media type plugins. It's built when the
   * `Hyperjump` is created, so changing a plugin's quality after that
   * doesn't change it.
   *
   * @type string
   */
  #accept;

  /**
   * @param {API.HyperjumpConfig} [config]
   */
  constructor(config = {}) {
    // Each session resolves it, but an entry that isn't a URL throws here
    if (config.allowRetrieval !== undefined) {
      resolveAllowRetrieval(config.allowRetrieval, contextUri(), configSource);
    }

    // A frozen copy, so a change to the object it was given, after it was
    // checked, doesn't change what new sessions allow
    this.#config = Object.freeze({
      ...config,
      allowRetrieval: frozenCopy(config.allowRetrieval),
      uriSchemePlugins: frozenCopy(config.uriSchemePlugins),
      mediaTypePlugins: frozenCopy(config.mediaTypePlugins)
    });

    // The config's plugins come after the defaults, and a later plugin for a
    // scheme or media type replaces an earlier one. A replacement keeps its
    // place, which is the order of the Accept header and of ties.
    this.#uriSchemePlugins = new Map();
    for (const plugin of [...defaultUriSchemePlugins(), ...config.uriSchemePlugins ?? []]) {
      // A scheme is case-insensitive
      for (const scheme of plugin.schemes) {
        this.#uriSchemePlugins.set(scheme.toLowerCase(), plugin);
      }
    }

    this.#mediaTypePlugins = new Map();
    for (const plugin of [new JrefMediaTypePlugin(), new JsonMediaTypePlugin(), ...config.mediaTypePlugins ?? []]) {
      this.#mediaTypePlugins.set(plugin.mediaType, plugin);
    }

    this.#accept = acceptHeader(this.#mediaTypePlugins);
  }

  get config() {
    return this.#config;
  }

  get uriSchemePlugins() {
    return this.#uriSchemePlugins;
  }

  get mediaTypePlugins() {
    return this.#mediaTypePlugins;
  }

  get accept() {
    return this.#accept;
  }

  /** @type API.Hyperjump<JrefNode>["session"] */
  session(options) {
    return new Session(this, options);
  }

  /** @type API.Hyperjump<JrefNode>["fragmentPointer"] */
  fragmentPointer(document, fragment) {
    return fragmentPointer(this.#mediaTypePlugins, document, fragment);
  }
}

/**
 * @template T
 * @param {T[] | undefined} array
 * @returns {T[] | undefined}
 */
const frozenCopy = (array) => array && /** @type T[] */ (Object.freeze([...array]));

/**
 * @implements API.Session<JrefNode>
 */
export class Session {
  /** @type Hyperjump */
  #hyperjump;

  /**
   * Documents by normalized URI, so equivalent URIs, like ones written with
   * a different case, are one document. The promise is cached so a document
   * that's requested again while it's being retrieved is only retrieved once.
   *
   * @type Record<NormalizedIri, Promise<DocumentNode>>
   */
  #cache;

  /** @type AllowedUrls */
  #allowedUrls;

  /**
   * Where the session's `allowRetrieval` came from, so a refused URL's error
   * says which list to change. A session's own list replaces the config's,
   * so adding to the config wouldn't allow it.
   *
   * @type string
   */
  #allowRetrievalSource;

  /**
   * What relative URIs are resolved against, as it was when the session was
   * created, so it's the same for everything the session does. A new
   * session sees a change, like any other. There's none where there's no
   * document, such as in a worker.
   *
   * @type AbsoluteIri | undefined
   */
  #contextUri;

  /**
   * @param {Hyperjump} hyperjump
   * @param {API.SessionOptions} [options]
   */
  constructor(hyperjump, options = {}) {
    this.#hyperjump = hyperjump;
    this.#cache = {};
    this.#contextUri = contextUri();
    const [allowRetrieval, source] = options.allowRetrieval === undefined
      ? [hyperjump.config.allowRetrieval, configSource]
      : [options.allowRetrieval, sessionSource];
    this.#allowRetrievalSource = source;
    this.#allowedUrls = new AllowedUrls(allowRetrieval === undefined ? undefined : resolveAllowRetrieval(allowRetrieval, this.#contextUri, source), this.#contextUri);
  }

  get hyperjump() {
    return this.#hyperjump;
  }

  /** @type API.Session<JrefNode>["get"] */
  async get(uri, options = {}) {
    assertIriReference(uri);
    assertGetOptions(options);
    return this.#get(uri, options, []);
  }

  /**
   * @param {IriReference} uri
   * @param {API.GetOptions} options
   * @param {Iri[]} referenceChain - URIs of the references followed to get here
   * @returns {Promise<FollowedNode>}
   */
  async #get(uri, options, referenceChain) {
    const iri = this.#resolve(uri);
    if (referenceChain.includes(iri)) {
      throw new ReferenceCycleError([...referenceChain, iri]);
    }
    referenceChain = [...referenceChain, iri];

    const { fragment } = parseIri(iri);
    // Subclasses can override getDocument, so every lookup goes through it
    const document = await this.getDocument(iri, options);

    const cursor = fragment === undefined ? "" : this.#hyperjump.fragmentPointer(document, fragment);
    const node = jsonPointerGet(cursor, document.children[0]);
    if (node.type === "reference") {
      return this.#get(node.href, { referencedFrom: documentUriOf(node.location) }, referenceChain);
    } else {
      return node;
    }
  }

  /**
   * A relative URI is resolved against the session's context URI. An
   * absolute one is kept as it's written, so a `getDocument` override finds
   * it that way. A media type plugin has already resolved a reference when
   * it parsed it, so a reference that's followed is never resolved again.
   *
   * @type (uri: IriReference) => Iri
   */
  #resolve(uri) {
    if (hasScheme(uri)) {
      return uri;
    } else if (this.#contextUri === undefined) {
      throw TypeError(`'${uri}' is relative, and there's nothing to resolve it against here. Use an absolute URI.`);
    } else {
      return resolveIri(uri, this.#contextUri);
    }
  }

  /**
   * The document is retrieved by its URI resolved and normalized, and cached
   * by that without its fragment, after an override has looked for the URI
   * as it's written. Equivalent URIs are one document, and its URI doesn't
   * depend on whether its plugin gives the response a URL.
   *
   * @type API.Session<JrefNode>["getDocument"]
   */
  async getDocument(uri, options = {}) {
    assertIriReference(uri);
    assertGetOptions(options);
    const iri = normalizeIri(this.#resolve(uri));
    const id = toAbsoluteIri(iri);

    this.#cache[id] ??= this.#retrieveDocument(iri, options).catch((/** @type unknown */ error) => {
      // A failure isn't cached, so it can be tried again
      delete this.#cache[id];
      throw error;
    });

    return this.#cache[id];
  }

  /**
   * Every retrieval is checked against `allowRetrieval` before the URI
   * scheme plugins, so before the HTTP cache too. A plugin's redirect is
   * followed here, so where it leads is checked before it's retrieved, and
   * its retrieval is given the same options. The response is checked again,
   * because a symlink, or a redirect `fetch` followed in a browser, can lead
   * somewhere else. A refused URL isn't one that couldn't be retrieved, so
   * it isn't a RetrievalError.
   *
   * @type (uri: Iri, options: CheckedGetOptions) => Promise<DocumentNode>
   */
  async #retrieveDocument(uri, options) {
    const id = toAbsoluteIri(uri);

    let response;
    let responseUrl;
    let url = uri;
    for (let redirects = 0; ; redirects++) {
      const hop = toAbsoluteIri(url);
      if (!await this.#allowedUrls.allows(hop)) {
        throw this.#notAllowedError(id, hop);
      }

      try {
        ({ response, url: responseUrl } = await this.#retrieve(url, options));
      } catch (error) {
        throw new RetrievalError(uri, { cause: error });
      }

      const location = redirectStatuses.has(response.status) ? response.headers.get("location") : null;
      if (location === null) {
        break;
      }

      await response.body?.cancel();
      if (redirects === maxRedirects) {
        throw new RetrievalError(uri, { cause: Error(`It was redirected more than ${maxRedirects} times`) });
      }

      // `retrieve` gives every response a URL. The `Location` comes from
      // outside, so it's checked. The fragment isn't part of what's
      // retrieved.
      try {
        assertIriReference(location);
        url = toAbsoluteIri(resolveIri(location, responseUrl));
      } catch (error) {
        throw new RetrievalError(uri, { cause: error });
      }
    }

    if (responseUrl !== toAbsoluteIri(url) && !await this.#allowedUrls.allows(responseUrl)) {
      await response.body?.cancel();
      throw this.#notAllowedError(id, responseUrl);
    }

    try {
      const document = await this.#parseResponse(response);

      // References within the document are relative to the URI it was
      // retrieved from, which can differ from the requested URI (redirects,
      // symlinks), so it needs to be cached under both.
      this.#cache[normalizeIri(responseUrl)] ??= Promise.resolve(document);

      return document;
    } catch (error) {
      throw new RetrievalError(uri, { cause: error });
    }
  }

  /**
   * Retrieve with the plugin for the URI's scheme. It gives the plugin the
   * Accept header for the media types that are supported, and the media type
   * of a URL's extension, for a scheme without a Content-Type.
   *
   * The response's URL comes from outside, so it's made an IRI here, for
   * every plugin: one that's already an IRI, like the URI the file plugin
   * was given, is kept as it is, and any other is a URL, like `fetch`'s, and
   * made one with `urlToIri`. A response without a URL gets the one that was
   * retrieved, so a redirect's `Location` can be relative to it. The
   * response's `url` is the IRI too, so a media type plugin has it. The
   * fragment isn't part of what's retrieved.
   *
   * @type (uri: Iri, options: CheckedGetOptions) => Promise<{ response: RetrievedResponse, url: AbsoluteIri }>
   */
  async #retrieve(uri, options) {
    const { scheme } = parseIri(uri);

    const plugin = this.#hyperjump.uriSchemePlugins.get(scheme.toLowerCase());
    if (!plugin) {
      throw new UnsupportedUriSchemeError(scheme, `The '${scheme}:' URI scheme is not supported. Use the 'uriSchemePlugins' config to add support for '${scheme}:' URIs.`);
    }

    const { mediaTypePlugins } = this.#hyperjump;
    const response = await plugin.retrieve(uri, {
      ...options,
      accept: this.#hyperjump.accept,
      mediaTypeByExtension: (uri) => mediaTypeByExtension(mediaTypePlugins, uri)
    });
    const url = toAbsoluteIri(!response.url
      ? uri
      : isIri(response.url) ? response.url : urlToIri(new URL(response.url)));
    if (url === response.url) {
      return { response: /** @type RetrievedResponse */ (response), url };
    }

    // A plugin can have defined its response's URL, which can't be redefined,
    // so the IRI goes on a new response with the same status, headers, and
    // body
    const retrieved = new Response(response.body, response);
    Object.defineProperty(retrieved, "url", { value: url });
    return { response: /** @type RetrievedResponse */ (retrieved), url };
  }

  /**
   * Parse a response with the media type plugin for its Content-Type. The
   * document's `mediaType` is the plugin's, unless the plugin set another. A
   * response that no plugin can parse has its body cancelled, so its file or
   * connection is released.
   *
   * @type (response: RetrievedResponse) => Promise<DocumentNode>
   */
  async #parseResponse(response) {
    let pattern, plugin;
    try {
      [pattern, plugin] = mediaTypePluginFor(this.#hyperjump.mediaTypePlugins, response.headers.get("content-type"), response.url);
    } catch (error) {
      await response.body?.cancel();
      throw error;
    }

    // A plugin can say the document is a more specific media type, like a
    // JSON document that turns out to be in a media type of its own
    const document = await plugin.parse(response, this);
    document.mediaType ??= pattern;
    return document;
  }

  /**
   * The error for a URL that was asked for (`id`), or one it led to, that
   * isn't allowed
   *
   * @type (id: AbsoluteIri, url: AbsoluteIri) => RetrievalNotAllowedError
   */
  #notAllowedError(id, url) {
    const message = url === id
      ? `Retrieving '${relativeFileUri(id)}' isn't allowed.`
      : `Retrieving '${relativeFileUri(id)}' led to '${relativeFileUri(url)}', which isn't allowed.`;
    return new RetrievalNotAllowedError(url, `${message} Use the ${this.#allowRetrievalSource} to allow it.`);
  }
}

/**
 * The options given to `get` or `getDocument` come from outside, like the
 * URI, so `referencedFrom` is checked. One from a reference that's followed
 * is checked again, which is one pattern test.
 *
 * @param {API.GetOptions} options
 * @returns {asserts options is CheckedGetOptions}
 */
function assertGetOptions(options) {
  if (options.referencedFrom !== undefined) {
    assertIri(options.referencedFrom);
  }
}

export class RetrievalError extends Error {
  /**
   * @param {Iri} uri
   * @param {{ cause: unknown }} options
   */
  constructor(uri, options) {
    super(`Unable to load resource '${relativeFileUri(uri)}'`, options);
    this.name = this.constructor.name;
    this.uri = uri;
  }
}

export class FileNotFoundError extends Error {
  /**
   * @param {Iri} uri
   */
  constructor(uri) {
    super(`There's no file at '${relativeFileUri(uri)}'`);
    this.name = this.constructor.name;
    this.uri = uri;
  }
}

export class RetrievalNotAllowedError extends Error {
  /**
   * @param {Iri} uri
   * @param {string} message
   */
  constructor(uri, message) {
    super(message);
    this.name = this.constructor.name;
    this.uri = uri;
  }
}

export class ReferenceCycleError extends Error {
  /** @type Iri[] */
  referenceChain;

  /**
   * @param {Iri[]} referenceChain
   */
  constructor(referenceChain) {
    super(`Reference cycle: ${referenceChain.map(relativeFileUri).join(" -> ")}`);
    this.name = this.constructor.name;
    this.referenceChain = referenceChain;
  }
}

export class UnsupportedUriSchemeError extends Error {
  /**
   * @param {string} scheme
   * @param {string} [message]
   */
  constructor(scheme, message) {
    super(message);
    this.name = this.constructor.name;
    this.scheme = scheme;
  }
}

export class UnsupportedMediaTypeError extends Error {
  /** @type string | undefined */
  mediaType;

  /**
   * @param {string | undefined} mediaType
   * @param {string} [message]
   */
  constructor(mediaType, message) {
    super(message);
    this.name = this.constructor.name;
    this.mediaType = mediaType;
  }
}
