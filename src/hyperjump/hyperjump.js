import { parseIri, resolveIri, toAbsoluteIri } from "@hyperjump/uri";
import { isTypeValid, parse as parseContentType } from "content-type";
import { contextUri } from "#context-uri";
import { defaultUriSchemePlugins } from "#default-uri-scheme-plugins";
import { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.js";
import { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.js";
import { jsonObjectEntries, jsonObjectHas, jsonObjectKeys, jsonObjectValues, jsonValue, pointerGet, pointerStep } from "../json/jsonast-util.js";
import { mimeMatchSpecificity } from "./utilities.js";
import { AllowedUrls, resolveAllowRetrieval } from "./allowed-urls.js";
import { relativeFileUri } from "./file-uris.js";

/**
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { UriSchemePlugin } from "./uri-schemes/uri-scheme-plugin.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.d.ts"
 * @import * as API from "./hyperjump.d.ts"
 */

// TODO: Support fetch options in get
// TODO: Support filters

// A `Hyperjump`'s private retrieve and parse, for `Session`. They're set in
// `Hyperjump`'s static block, which can read its private methods, and
// aren't exported, so they aren't part of the API.

/** @type (hyperjump: Hyperjump, uri: string, options: API.GetOptions) => Promise<Response> */
let retrieve;

/** @type (hyperjump: Hyperjump, response: Response, session: Session) => Promise<DocumentNode> */
let parseResponse;

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

  /** @type Record<string, UriSchemePlugin> */
  #uriSchemePlugins;

  /** @type Record<string, MediaTypePlugin<DocumentNode>> */
  #mediaTypePlugins;

  /**
   * @param {API.HyperjumpConfig} [config]
   */
  constructor(config = {}) {
    this.#config = config;

    // Each session resolves it, but a config that isn't a list of URLs
    // throws here
    if (config.allowRetrieval !== undefined) {
      resolveAllowRetrieval(config.allowRetrieval, contextUri());
    }

    // The config's plugins come after the defaults, and a later plugin for a
    // scheme or media type replaces an earlier one. A replacement keeps its
    // place, which is the order of the Accept header and of ties.
    this.#uriSchemePlugins = {};
    for (const plugin of [...defaultUriSchemePlugins(), ...config.uriSchemePlugins ?? []]) {
      for (const scheme of plugin.schemes) {
        this.#uriSchemePlugins[scheme] = plugin;
      }
    }

    this.#mediaTypePlugins = {};
    for (const plugin of [new JrefMediaTypePlugin(), new JsonMediaTypePlugin(), ...config.mediaTypePlugins ?? []]) {
      this.#mediaTypePlugins[plugin.mediaType] = plugin;
    }
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
   * without a URL gets the one that was retrieved, so a response from
   * `options.retrieve` is checked against where it came from.
   *
   * @type (uri: string, options: API.GetOptions) => Promise<Response>
   */
  async #retrieve(uri, options) {
    const { scheme } = parseIri(uri);

    if (!(scheme in this.#uriSchemePlugins)) {
      throw new UnsupportedUriSchemeError(scheme, `The '${scheme}:' URI scheme is not supported. Use the 'uriSchemePlugins' config to add support for '${scheme}:' URIs.`);
    }

    const response = await this.#uriSchemePlugins[scheme].retrieve(uri, {
      ...options,
      accept: this.#acceptableMediaTypes(),
      mediaTypeByExtension: (uri) => this.#mediaTypeByExtension(uri),
      retrieve: (uri, options = {}) => this.#retrieve(uri, options)
    });
    if (!response.url) {
      Object.defineProperty(response, "url", { value: toAbsoluteIri(uri) });
    }

    return response;
  }

  /** @type () => string */
  #acceptableMediaTypes() {
    let accept = "";

    for (const contentType in this.#mediaTypePlugins) {
      accept = this.#addAcceptableMediaType(accept, contentType, this.#mediaTypePlugins[contentType].quality);
    }

    return this.#addAcceptableMediaType(accept, "*/*", 0.001);
  }

  /** @type (accept: string, contentType: string, quality: number | undefined) => string */
  #addAcceptableMediaType(accept, contentType, quality) {
    if (accept.length > 0) {
      accept += ", ";
    }
    accept += contentType;
    if (quality !== undefined) {
      accept += `; q=${quality}`;
    }

    return accept;
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
    for (const contentType in this.#mediaTypePlugins) {
      for (const extension of this.#mediaTypePlugins[contentType].extensions) {
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
   * document's `mediaType` is the plugin's, unless the plugin set another.
   *
   * @type (response: Response, session: Session) => Promise<DocumentNode>
   */
  async #parseResponse(response, session) {
    const contentTypeText = response.headers.get("content-type");
    if (contentTypeText === null) {
      throw new UnknownMediaTypeError(`The media type of '${relativeFileUri(response.url)}' could not be determined. A response needs a 'Content-Type' header, and a file needs an extension that a media type plugin has. Use the 'mediaTypePlugins' config to add support for a media type.`);
    }

    // The parser is lenient, so the type needs to be validated
    const contentType = parseContentType(contentTypeText);
    if (!isTypeValid(contentType.type)) {
      throw new UnknownMediaTypeError(`The media type of the response could not be determined. The 'Content-Type' header isn't valid: '${contentTypeText}'`);
    }

    // Use the plugin with the most specific match. If there's a tie, the plugin
    // that was registered first wins.
    let bestPattern;
    let bestSpecificity = 0;
    for (const pattern in this.#mediaTypePlugins) {
      const specificity = mimeMatchSpecificity(pattern, contentType.type);
      if (specificity > bestSpecificity) {
        bestPattern = pattern;
        bestSpecificity = specificity;
      }
    }

    if (bestPattern !== undefined) {
      // A plugin can say the document is a more specific media type, like a
      // JSON document that turns out to be in a media type of its own
      const document = await this.#mediaTypePlugins[bestPattern].parse(response, session);
      document.mediaType ??= bestPattern;
      return document;
    }

    throw new UnsupportedMediaTypeError(contentType.type, `'${contentType.type}' is not supported. Use the 'mediaTypePlugins' config to add support for this media type.`);
  }

  /** @type API.Hyperjump<JrefNode>["fragmentPointer"] */
  fragmentPointer(document, fragment) {
    // A media type that doesn't define fragments identifies the whole document
    if (document.mediaType === undefined) {
      return "";
    }

    return this.#mediaTypePlugins[document.mediaType]?.fragmentPointer?.(document, fragment) ?? "";
  }
}

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
    const allowRetrieval = options.allowRetrieval ?? hyperjump.config.allowRetrieval;
    this.#allowedUrls = new AllowedUrls(allowRetrieval === undefined ? undefined : resolveAllowRetrieval(allowRetrieval, this.#contextUri), this.#contextUri);
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
    const node = pointerGet(cursor, document.children[0], document.uri && relativeFileUri(document.uri));
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
   * scheme plugins, so before the HTTP cache too. The response is checked
   * again, because a redirect or a symlink can lead somewhere else. A refused
   * URL isn't one that couldn't be retrieved, so it isn't a RetrievalError.
   *
   * @type (uri: string, options: API.GetOptions) => Promise<DocumentNode>
   */
  async #retrieveDocument(uri, options) {
    const id = toAbsoluteIri(uri);
    if (!await this.#allowedUrls.allows(id)) {
      throw new RetrievalNotAllowedError(id);
    }

    let response;
    try {
      response = await retrieve(this.#hyperjump, uri, options);
    } catch (error) {
      throw new RetrievalError(uri, { cause: error });
    }

    if (response.url && response.url !== id && !await this.#allowedUrls.allows(response.url)) {
      await response.body?.cancel();
      throw new RetrievalNotAllowedError(response.url, `Retrieving '${relativeFileUri(id)}' led to '${relativeFileUri(response.url)}', which isn't allowed. Use the 'allowRetrieval' config to allow it.`);
    }

    try {
      const document = await parseResponse(this.#hyperjump, response, this);

      // References within the document are relative to the URI it was
      // retrieved from, which can differ from the requested URI (redirects,
      // symlinks), so it needs to be cached under both.
      if (response.url) {
        this.#cache[toAbsoluteIri(response.url)] ??= Promise.resolve(document);
      }

      return document;
    } catch (error) {
      throw new RetrievalError(uri, { cause: error });
    }
  }

  /** @type (node: JrefNode, referenceChain?: string[]) => Promise<JrefNode> */
  async #followReferences(node, referenceChain = []) {
    if (node.type === "reference") {
      return this.#get(node.href, { referencedFrom: toAbsoluteIri(node.location) }, referenceChain);
    } else {
      return node;
    }
  }

  // TODO: Follow references in structured values
  // eslint-disable-next-line @stylistic/no-extra-parens
  value = /** @type API.Session<JrefNode>["value"] */ ((/** @type JrefNode */ node) => {
    if (node.jsonType === "object" || node.jsonType === "array") {
      throw Error("Can't get the value of a structured value.");
    }

    return jsonValue(node);
  });

  has = jsonObjectHas;

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

  keys = jsonObjectKeys;

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
   * @param {string} [message]
   */
  constructor(uri, message = `Retrieving '${relativeFileUri(uri)}' isn't allowed. Use the 'allowRetrieval' config to allow it.`) {
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
  /** @type string */
  mediaType;

  /**
   * @param {string} mediaType
   * @param {string} [message]
   */
  constructor(mediaType, message) {
    super(message);
    this.name = this.constructor.name;
    this.mediaType = mediaType;
  }
}

export class UnknownMediaTypeError extends Error {
  /**
   * @param {string} [message]
   */
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}
