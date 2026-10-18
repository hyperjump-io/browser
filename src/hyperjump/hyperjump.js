import { parseIri, resolveIri, toAbsoluteIri } from "@hyperjump/uri";
import { isTypeValid, parse as parseContentType } from "content-type";
import { contextUri } from "#context-uri";
import { defaultUriSchemePlugins } from "#default-uri-scheme-plugins";
import { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.js";
import { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.js";
import { jsonObjectEntries, jsonObjectHas, jsonObjectKeys, jsonObjectValues, jsonValue, pointerGet, pointerStep } from "../json/jsonast-util.js";
import { mimeMatchSpecificity } from "./utilities.js";

/**
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { UriSchemePlugin } from "./uri-schemes/uri-scheme-plugin.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.d.ts"
 * @import * as API from "./hyperjump.d.ts"
 */

// TODO: Support fetch options in get
// TODO: Support filters

/**
 * @implements API.Hyperjump<JrefNode>
 */
export class Hyperjump {
  // TODO: Add config to enable schemes and media types
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

    this.#uriSchemePlugins = {};
    this.#mediaTypePlugins = {};

    // Load default URI scheme plugins
    for (const plugin of defaultUriSchemePlugins(this)) {
      this.addUriSchemePlugin(plugin);
    }

    // Load default MediaType plugins
    this.addMediaTypePlugin(new JrefMediaTypePlugin());
    this.addMediaTypePlugin(new JsonMediaTypePlugin());
  }

  /** @type API.Hyperjump<JrefNode>["session"] */
  session() {
    return new Session(this);
  }

  /** @type API.Hyperjump<JrefNode>["addUriSchemePlugin"] */
  addUriSchemePlugin(plugin) {
    for (const scheme of plugin.schemes) {
      this.#uriSchemePlugins[scheme] = plugin;
    }
  }

  /** @type API.Hyperjump<JrefNode>["removeUriSchemePlugin"] */
  removeUriSchemePlugin(scheme) {
    delete this.#uriSchemePlugins[scheme];
  }

  /** @type API.Hyperjump<JrefNode>["retrieve"] */
  async retrieve(uri, options) {
    const { scheme } = parseIri(uri);

    if (!(scheme in this.#uriSchemePlugins)) {
      throw new UnsupportedUriSchemeError(scheme, `The '${scheme}:' URI scheme is not supported. Use the 'addUriSchemePlugin' function to add support for '${scheme}:' URIs.`);
    }

    return this.#uriSchemePlugins[scheme].retrieve(uri, options);
  }

  /** @type API.Hyperjump<JrefNode>["acceptableMediaTypes"] */
  acceptableMediaTypes() {
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

  /** @type API.Hyperjump<JrefNode>["getMediaType"] */
  getMediaType(uri) {
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

    if (bestContentType !== undefined) {
      return bestContentType;
    }

    throw new UnknownMediaTypeError(`The media type of the file at '${uri}' could not be determined. Use the 'addMediaTypePlugin' function to add support for this media type.`);
  }

  /** @type API.Hyperjump<JrefNode>["addMediaTypePlugin"] */
  addMediaTypePlugin(plugin) {
    this.#mediaTypePlugins[plugin.mediaType] = plugin;
  }

  /** @type API.Hyperjump<JrefNode>["removeMediaTypePlugin"] */
  removeMediaTypePlugin(contentType) {
    delete this.#mediaTypePlugins[contentType];
  }

  /** @type API.Hyperjump<JrefNode>["setMediaTypeQuality"] */
  setMediaTypeQuality(contentType, quality) {
    if (!(contentType in this.#mediaTypePlugins)) {
      throw new UnsupportedMediaTypeError(contentType, `'${contentType}' is not supported. Use the 'addMediaTypePlugin' function to add support for this media type.`);
    }

    this.#mediaTypePlugins[contentType].quality = quality;
  }

  /** @type API.Hyperjump<JrefNode>["parseResponse"] */
  async parseResponse(response) {
    const contentTypeText = response.headers.get("content-type");
    if (contentTypeText === null) {
      throw new UnknownMediaTypeError("The media type of the response could not be determined. Make sure the response includes a 'Content-Type' header.");
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
      const document = await this.#mediaTypePlugins[bestPattern].parse(response);
      document.mediaType = bestPattern;
      return document;
    }

    throw new UnsupportedMediaTypeError(contentType.type, `'${contentType.type}' is not supported. Use the 'addMediaTypePlugin' function to add support for this media type.`);
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

  /**
   * @param {Hyperjump} hyperjump
   */
  constructor(hyperjump) {
    this.#hyperjump = hyperjump;
    this.#cache = {};
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
    uri = resolveIri(uri, contextUri());
    if (referenceChain.includes(uri)) {
      throw new ReferenceCycleError([...referenceChain, uri]);
    }
    referenceChain = [...referenceChain, uri];

    const { fragment } = parseIri(uri);
    // Subclasses can override getDocument, so every lookup goes through it
    const document = await this.getDocument(uri, options);

    const cursor = fragment === undefined ? "" : this.#hyperjump.fragmentPointer(document, fragment);
    const node = pointerGet(cursor, document.children[0], document.uri);
    return await this.#followReferences(node, referenceChain);
  }

  /** @type API.Session<JrefNode>["getDocument"] */
  async getDocument(uri, options = {}) {
    uri = resolveIri(uri, contextUri());
    const id = toAbsoluteIri(uri);

    this.#cache[id] ??= this.#retrieveDocument(uri, options).catch((/** @type unknown */ error) => {
      // A failure isn't cached, so it can be tried again
      delete this.#cache[id];
      throw error;
    });

    return this.#cache[id];
  }

  /** @type (uri: string, options: API.GetOptions) => Promise<DocumentNode> */
  async #retrieveDocument(uri, options) {
    try {
      const response = await this.#hyperjump.retrieve(uri, options);
      const document = await this.#hyperjump.parseResponse(response);

      // References within the document are relative to the URI it was
      // retrieved from, which can differ from the requested URI (redirects,
      // symlinks), so it needs to be cached under both.
      if (response.url) {
        this.#cache[toAbsoluteIri(response.url)] ??= Promise.resolve(document);
      }

      return document;
    } catch (error) {
      throw new RetrievalError(`Unable to load resource '${uri}'`, { cause: error });
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
   * @param {string} message
   * @param {{ cause: unknown }} options
   */
  constructor(message, options) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class ReferenceCycleError extends Error {
  /** @type string[] */
  referenceChain;

  /**
   * @param {string[]} referenceChain
   */
  constructor(referenceChain) {
    super(`Reference cycle: ${referenceChain.join(" -> ")}`);
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
