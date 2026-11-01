import { parseIri, resolveIri, toAbsoluteIri } from "@hyperjump/uri";
import { contextUri } from "#context-uri";
import { defaultUriSchemePlugins } from "#default-uri-scheme-plugins";
import { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.js";
import { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.js";
import { jsonObjectEntries, jsonObjectHas, jsonObjectKeys, jsonObjectValues, jsonValue, pointerGet, pointerStep } from "../json/jsonast-util.js";
import { acceptHeader, fragmentPointer, mediaTypeByExtension, mediaTypePluginFor } from "./media-type-plugins.js";
import { AllowedUrls, configSource, resolveAllowRetrieval, sessionSource } from "./allowed-urls.js";
import { relativeFileUri } from "./file-uris.js";

/**
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { UriSchemePlugin } from "./uri-schemes/uri-scheme-plugin.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.d.ts"
 * @import * as API from "./hyperjump.d.ts"
 */

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
      for (const scheme of plugin.schemes) {
        this.#uriSchemePlugins.set(scheme, plugin);
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
    return /** @type ReadonlyMap<string, UriSchemePlugin> */ (this.#uriSchemePlugins);
  }

  get mediaTypePlugins() {
    return /** @type ReadonlyMap<string, MediaTypePlugin<DocumentNode>> */ (this.#mediaTypePlugins);
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
   * Documents by URI. The promise is cached so a document that's requested
   * again while it's being retrieved is only retrieved once.
   *
   * @type Record<string, Promise<DocumentNode>>
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
   * session sees a change, like any other.
   *
   * @type string
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
    return this.#get(uri, options, []);
  }

  /**
   * @param {string} uri
   * @param {API.GetOptions} options
   * @param {string[]} referenceChain - URIs of the references followed to get here
   * @returns {Promise<JrefNode>}
   */
  async #get(uri, options, referenceChain) {
    uri = resolveIri(uri, this.#contextUri);
    if (referenceChain.includes(uri)) {
      throw new ReferenceCycleError([...referenceChain, uri]);
    }
    referenceChain = [...referenceChain, uri];

    const { fragment } = parseIri(uri);
    // Subclasses can override getDocument, so every lookup goes through it
    const document = await this.getDocument(uri, options);

    const cursor = fragment === undefined ? "" : this.#hyperjump.fragmentPointer(document, fragment);
    const node = pointerGet(cursor, document.children[0]);
    return await this.#followReferences(node, referenceChain);
  }

  /** @type API.Session<JrefNode>["getDocument"] */
  async getDocument(uri, options = {}) {
    uri = resolveIri(uri, this.#contextUri);
    const id = toAbsoluteIri(uri);

    this.#cache[id] ??= this.#retrieveDocument(uri, options).catch((/** @type unknown */ error) => {
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
   * @type (uri: string, options: API.GetOptions) => Promise<DocumentNode>
   */
  async #retrieveDocument(uri, options) {
    const id = toAbsoluteIri(uri);

    let response;
    let url = uri;
    for (let redirects = 0; ; redirects++) {
      const hop = toAbsoluteIri(url);
      if (!await this.#allowedUrls.allows(hop)) {
        throw this.#notAllowedError(id, hop);
      }

      try {
        response = await this.#retrieve(url, options);
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

      // `retrieve` gives every response a URL. The fragment isn't part of
      // what's retrieved.
      try {
        url = toAbsoluteIri(resolveIri(location, response.url));
      } catch (error) {
        throw new RetrievalError(uri, { cause: error });
      }
    }

    if (response.url !== toAbsoluteIri(url) && !await this.#allowedUrls.allows(response.url)) {
      await response.body?.cancel();
      throw this.#notAllowedError(id, response.url);
    }

    try {
      const document = await this.#parseResponse(response);

      // References within the document are relative to the URI it was
      // retrieved from, which can differ from the requested URI (redirects,
      // symlinks), so it needs to be cached under both.
      this.#cache[toAbsoluteIri(response.url)] ??= Promise.resolve(document);

      return document;
    } catch (error) {
      throw new RetrievalError(uri, { cause: error });
    }
  }

  /**
   * Retrieve with the plugin for the URI's scheme. It gives the plugin the
   * Accept header for the media types that are supported, and the media type
   * of a URL's extension, for a scheme without a Content-Type. A response
   * without a URL gets the one that was retrieved, so a redirect's
   * `Location` can be relative to it.
   *
   * @type (uri: string, options: API.GetOptions) => Promise<Response>
   */
  async #retrieve(uri, options) {
    const { scheme } = parseIri(uri);

    const plugin = this.#hyperjump.uriSchemePlugins.get(scheme);
    if (!plugin) {
      throw new UnsupportedUriSchemeError(scheme, `The '${scheme}:' URI scheme is not supported. Use the 'uriSchemePlugins' config to add support for '${scheme}:' URIs.`);
    }

    const { mediaTypePlugins } = this.#hyperjump;
    const response = await plugin.retrieve(uri, {
      ...options,
      accept: this.#hyperjump.accept,
      mediaTypeByExtension: (uri) => mediaTypeByExtension(mediaTypePlugins, uri)
    });
    if (!response.url) {
      Object.defineProperty(response, "url", { value: toAbsoluteIri(uri) });
    }

    return response;
  }

  /**
   * Parse a response with the media type plugin for its Content-Type. The
   * document's `mediaType` is the plugin's, unless the plugin set another. A
   * response that no plugin can parse has its body cancelled, so its file or
   * connection is released.
   *
   * @type (response: Response) => Promise<DocumentNode>
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
   * @type (id: string, url: string) => RetrievalNotAllowedError
   */
  #notAllowedError(id, url) {
    const message = url === id
      ? `Retrieving '${relativeFileUri(id)}' isn't allowed.`
      : `Retrieving '${relativeFileUri(id)}' led to '${relativeFileUri(url)}', which isn't allowed.`;
    return new RetrievalNotAllowedError(url, `${message} Use the ${this.#allowRetrievalSource} to allow it.`);
  }

  /** @type (node: JrefNode, referenceChain?: string[]) => Promise<JrefNode> */
  async #followReferences(node, referenceChain = []) {
    if (node.type === "reference") {
      return this.#get(node.href, { referencedFrom: toAbsoluteIri(node.location) }, referenceChain);
    } else {
      return node;
    }
  }

  /** @param {JrefNode} node */
  value(node) {
    if (node.jsonType === "object" || node.jsonType === "array") {
      throw Error("Can't get the value of a structured value.");
    }

    // The overloads say which primitive it is, which jsonValue's can't
    return /** @type never */ (jsonValue(node));
  }

  /** @type API.Session<JrefNode>["has"] */
  has(key, node) {
    return jsonObjectHas(key, node);
  }

  /** @type API.Session<JrefNode>["step"] */
  async step(key, node) {
    return await this.#followReferences(pointerStep(key, node));
  }

  /** @type API.Session<JrefNode>["iter"] */
  async* iter(node) {
    if (node.jsonType === "array") {
      for (const itemNode of node.children) {
        yield this.#followReferences(itemNode);
      }
    }
  }

  /** @type API.Session<JrefNode>["keys"] */
  keys(node) {
    return jsonObjectKeys(node);
  }

  /** @type API.Session<JrefNode>["values"] */
  async* values(node) {
    if (node.jsonType === "object") {
      for (const valueNode of jsonObjectValues(node)) {
        yield this.#followReferences(valueNode);
      }
    }
  }

  /** @type API.Session<JrefNode>["entries"] */
  async* entries(node) {
    if (node.jsonType === "object") {
      for (const [key, valueNode] of jsonObjectEntries(node)) {
        yield [key, await this.#followReferences(valueNode)];
      }
    }
  }
}

export class RetrievalError extends Error {
  /**
   * @param {string} uri
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
   * @param {string} uri
   */
  constructor(uri) {
    super(`There's no file at '${relativeFileUri(uri)}'`);
    this.name = this.constructor.name;
    this.uri = uri;
  }
}

export class RetrievalNotAllowedError extends Error {
  /**
   * @param {string} uri
   * @param {string} message
   */
  constructor(uri, message) {
    super(message);
    this.name = this.constructor.name;
    this.uri = uri;
  }
}

export class ReferenceCycleError extends Error {
  /** @type string[] */
  referenceChain;

  /**
   * @param {string[]} referenceChain
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
