import { parseIri, resolveIri, toAbsoluteIri } from "@hyperjump/uri";
import { isTypeValid, parse as parseContentType } from "content-type";
import { contextUri } from "#context-uri";
import { defaultUriSchemePlugins } from "#default-uri-scheme-plugins";
import { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.js";
import { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.js";
import { jsonObjectEntries, jsonObjectHas, jsonObjectKeys, jsonObjectValues, jsonValue, pointerGet, pointerStep } from "../json/jsonast-util.js";
import { mimeMatchSpecificity } from "./utilities.js";
import { AllowedUrls, configSource, resolveAllowRetrieval, sessionSource } from "./allowed-urls.js";
import { relativeFileUri } from "./file-uris.js";

/**
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { UriSchemePlugin } from "./uri-schemes/uri-scheme-plugin.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.d.ts"
 * @import * as API from "./hyperjump.d.ts"
 */

// A `Hyperjump`'s private retrieve and parse, for `Session`. They're set in
// `Hyperjump`'s static block, which can read its private methods, and
// aren't exported, so they aren't part of the API.

/** @type (hyperjump: Hyperjump, uri: string, options: API.GetOptions) => Promise<Response> */
let retrieve;

/** @type (hyperjump: Hyperjump, response: Response, session: Session) => Promise<DocumentNode> */
let parseResponse;

/**
 * Redirects are followed this many times, like `fetch` does, so a redirect
 * cycle fails instead of going on forever
 */
const maxRedirects = 20;

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/**
 * Every media type plugin with its quality, and any media type last. A
 * quality is a number from 0 to 1 with at most three decimal places (RFC
 * 9110, section 12.4.2), or the `Hyperjump` throws when it's created.
 *
 * @type (mediaTypePlugins: Map<string, MediaTypePlugin<DocumentNode>>) => string
 */
const acceptHeader = (mediaTypePlugins) => {
  const mediaTypes = [];
  for (const [mediaType, { quality }] of mediaTypePlugins) {
    if (quality === undefined) {
      mediaTypes.push(mediaType);
    } else if (isQuality(quality)) {
      mediaTypes.push(`${mediaType}; q=${quality}`);
    } else {
      throw RangeError(`The quality of the '${mediaType}' media type plugin is ${String(quality)}. It must be a number from 0 to 1 with at most three decimal places.`);
    }
  }
  mediaTypes.push("*/*; q=0.001");

  return mediaTypes.join(", ");
};

/** @type (quality: unknown) => boolean */
const isQuality = (quality) => typeof quality === "number"
  && quality >= 0 && quality <= 1
  && Math.round(quality * 1000) / 1000 === quality;

/**
 * @class
 * @implements API.Hyperjump<JrefNode>
 */
export class Hyperjump {
  static {
    retrieve = (hyperjump, uri, options) => hyperjump.#retrieve(uri, options);
    parseResponse = (hyperjump, response, session) => hyperjump.#parseResponse(response, session);
  }

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

  /** @type API.Hyperjump<JrefNode>["session"] */
  session(options) {
    return new Session(this, options);
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

    const plugin = this.#uriSchemePlugins.get(scheme);
    if (!plugin) {
      throw new UnsupportedUriSchemeError(scheme, `The '${scheme}:' URI scheme is not supported. Use the 'uriSchemePlugins' config to add support for '${scheme}:' URIs.`);
    }

    const response = await plugin.retrieve(uri, {
      ...options,
      accept: this.#accept,
      mediaTypeByExtension: (uri) => this.#mediaTypeByExtension(uri)
    });
    if (!response.url) {
      Object.defineProperty(response, "url", { value: toAbsoluteIri(uri) });
    }

    return response;
  }

  /**
   * The media type of a URL's extension, if a media type plugin has it
   *
   * @type (uri: string) => string | undefined
   */
  #mediaTypeByExtension(uri) {
    // Use the plugin with the longest matching extension so `.schema.json`
    // takes precedence over `.json`. If there's a tie, the plugin that was
    // registered first wins.
    let bestContentType;
    let bestLength = 0;
    for (const [contentType, plugin] of this.#mediaTypePlugins) {
      for (const extension of plugin.extensions) {
        if (extension.length > bestLength && uri.endsWith(extension)) {
          if (extension.startsWith("/") || (extension.startsWith(".") && uri[uri.length - extension.length - 1] !== "/")) {
            bestContentType = contentType;
            bestLength = extension.length;
          }
        }
      }
    }

    return bestContentType;
  }

  /**
   * Parse a response with the media type plugin for its Content-Type. The
   * document's `mediaType` is the plugin's, unless the plugin set another. A
   * response that no plugin can parse has its body cancelled, so its file or
   * connection is released.
   *
   * @type (response: Response, session: Session) => Promise<DocumentNode>
   */
  async #parseResponse(response, session) {
    let pattern, plugin;
    try {
      [pattern, plugin] = this.#mediaTypePluginFor(response);
    } catch (error) {
      await response.body?.cancel();
      throw error;
    }

    // A plugin can say the document is a more specific media type, like a
    // JSON document that turns out to be in a media type of its own
    const document = await plugin.parse(response, session);
    document.mediaType ??= pattern;
    return document;
  }

  /**
   * The media type plugin with the most specific match for a response's
   * Content-Type. If there's a tie, the plugin that was registered first wins.
   *
   * @type (response: Response) => [string, MediaTypePlugin<DocumentNode>]
   */
  #mediaTypePluginFor(response) {
    const contentTypeText = response.headers.get("content-type");
    if (contentTypeText === null) {
      throw new UnsupportedMediaTypeError(undefined, `The media type of '${relativeFileUri(response.url)}' could not be determined. A response needs a 'Content-Type' header, and a file needs an extension that a media type plugin has. Use the 'mediaTypePlugins' config to add support for a media type.`);
    }

    // The parser is lenient, so the type needs to be validated
    const contentType = parseContentType(contentTypeText);
    if (!isTypeValid(contentType.type)) {
      throw new UnsupportedMediaTypeError(undefined, `The media type of the response could not be determined. The 'Content-Type' header isn't valid: '${contentTypeText}'`);
    }

    /** @type [string, MediaTypePlugin<DocumentNode>] | undefined */
    let best;
    let bestSpecificity = 0;
    for (const [pattern, plugin] of this.#mediaTypePlugins) {
      const specificity = mimeMatchSpecificity(pattern, contentType.type);
      if (specificity > bestSpecificity) {
        best = [pattern, plugin];
        bestSpecificity = specificity;
      }
    }

    if (!best) {
      throw new UnsupportedMediaTypeError(contentType.type, `'${contentType.type}' is not supported. Use the 'mediaTypePlugins' config to add support for this media type.`);
    }

    return best;
  }

  /** @type API.Hyperjump<JrefNode>["fragmentPointer"] */
  fragmentPointer(document, fragment) {
    // A media type that doesn't define fragments identifies the whole document
    if (document.mediaType === undefined) {
      return "";
    }

    return this.#mediaTypePlugins.get(document.mediaType)?.fragmentPointer?.(document, fragment) ?? "";
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
        response = await retrieve(this.#hyperjump, url, options);
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
      const document = await parseResponse(this.#hyperjump, response, this);

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
