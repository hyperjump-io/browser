import { parseIri, resolveIri, toAbsoluteIri } from "@hyperjump/uri";
import { parse as parseContentType } from "content-type";
import { contextUri } from "#context-uri";
import { defaultUriSchemePlugins } from "#default-uri-scheme-plugins";
import { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.js";
import { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.js";
import { jsonObjectHas, jsonObjectKeys, jsonValue, pointerGet, pointerStep } from "../json/jsonast-util.js";
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

  /** @type Record<string, DocumentNode> */
  #cache;

  /** @type Record<string, UriSchemePlugin> */
  #uriSchemePlugins;

  /** @type Record<string, MediaTypePlugin<DocumentNode>> */
  #mediaTypePlugins;

  /** @type API.GetOptions */
  #defaultGetOptions;

  /**
   * @param {API.HyperjumpConfig} [config]
   */
  constructor(config = {}) {
    this.#config = config;

    this.#cache = {};

    this.#uriSchemePlugins = {};
    this.#mediaTypePlugins = {};

    this.#defaultGetOptions = {};

    // Load default URI scheme plugins
    for (const plugin of defaultUriSchemePlugins(this)) {
      this.addUriSchemePlugin(plugin);
    }

    // Load default MediaType plugins
    this.addMediaTypePlugin(new JrefMediaTypePlugin());
    this.addMediaTypePlugin(new JsonMediaTypePlugin());
  }

  /** @type API.Hyperjump<JrefNode>["get"] */
  async get(uri, options = this.#defaultGetOptions) {
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

    const id = toAbsoluteIri(uri);
    let { fragment } = parseIri(uri);

    // TODO: How should cache work?

    const cachedDocument = this.#cache[id];
    const embeddedDocument = options.referencedFrom ? this.#cache[options.referencedFrom]?.embedded?.[id] : undefined;
    let document = cachedDocument ?? embeddedDocument;

    if (!document) {
      try {
        const response = await this.retrieve(uri, options);
        document = await this.#parseResponse(response);
        uri = response.url + (fragment === undefined ? "" : `#${fragment}`);

        // References within the document are relative to the URI it was
        // retrieved from, which can differ from the requested URI (redirects,
        // symlinks), so it needs to be cached under both.
        if (response.url) {
          this.#cache[toAbsoluteIri(response.url)] = document;
        }
      } catch (error) {
        throw new RetrievalError(`Unable to load resource '${uri}'`, { cause: error });
      }

      this.#cache[id] = document;
    }

    if (document.anchors && fragment !== undefined) {
      fragment = document.anchors[fragment] ?? fragment;
    }
    const cursor = document.fragmentKind === "json-pointer" ? fragment : "";

    const node = pointerGet(cursor ?? "", document.children[0], document.uri);
    return await this.#followReferences(node, referenceChain);
  }

  /** @type (node: JrefNode, referenceChain?: string[]) => Promise<JrefNode> */
  async #followReferences(node, referenceChain = []) {
    if (node.type === "reference") {
      return this.#get(node.href, { referencedFrom: toAbsoluteIri(node.location) }, referenceChain);
    } else {
      return node;
    }
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
    for (const contentType in this.#mediaTypePlugins) {
      for (const extension of this.#mediaTypePlugins[contentType].extensions) {
        if (uri.endsWith(extension)) {
          if (extension.startsWith("/") || (extension.startsWith(".") && uri[uri.length - extension.length - 1] !== "/")) {
            return contentType;
          }
        }
      }
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

  /** @type (response: Response) => Promise<DocumentNode> */
  #parseResponse(response) {
    const contentTypeText = response.headers.get("content-type");
    if (contentTypeText === null) {
      throw new UnknownMediaTypeError("The media type of the response could not be determined. Make sure the response includes a 'Content-Type' header.");
    }

    const contentType = parseContentType(contentTypeText);

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
      return this.#mediaTypePlugins[bestPattern].parse(response);
    }

    throw new UnsupportedMediaTypeError(contentType.type, `'${contentType.type}' is not supported. Use the 'addMediaTypePlugin' function to add support for this media type.`);
  }

  value = jsonValue;
  has = jsonObjectHas;

  /** @type API.Hyperjump<JrefNode>["step"] */
  async step(key, node) {
    return await this.#followReferences(pointerStep(key, node));
  }

  /** @type API.Hyperjump<JrefNode>["iter"] */
  async* iter(node) {
    if (node.jsonType === "array") {
      for (const itemNode of node.children) {
        yield this.#followReferences(itemNode);
      }
    }
  }

  keys = jsonObjectKeys;

  /** @type API.Hyperjump<JrefNode>["values"] */
  async* values(node) {
    if (node.jsonType === "object") {
      for (const propertyNode of node.children) {
        yield this.#followReferences(propertyNode.children[1]);
      }
    }
  }

  /** @type API.Hyperjump<JrefNode>["entries"] */
  async* entries(node) {
    if (node.jsonType === "object") {
      for (const propertyNode of node.children) {
        yield [
          propertyNode.children[0].value,
          await this.#followReferences(propertyNode.children[1])
        ];
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
