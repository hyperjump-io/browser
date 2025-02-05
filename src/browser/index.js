import { parseIri, resolveIri, toAbsoluteIri } from "@hyperjump/uri";
import { parse as parseContentType } from "content-type";
import { match as mediaTypeMatch } from "type-is";
import { contextUri } from "./context-uri.js";
import { HttpUriSchemePlugin } from "./uri-schemes/http-scheme-plugin.js";
import { FileUriSchemePlugin } from "./uri-schemes/file-scheme-plugin.js";
import { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.js";
import { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.js";
import { pointerGet } from "../jref/jref-util.js";

/**
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { JsonCompatible, JsonType } from "../json/jsonast.d.ts"
 * @import { UriSchemePlugin } from "./uri-schemes/uri-scheme-plugin.d.ts"
 * @import { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.d.ts"
 */


/**
 * @typedef {{}} HyperjumpConfig
 */

// TODO: Support fetch options in get
/**
 * @typedef {{
 *   referencedFrom?: string;
 * }} FetchOptions
 */

export class Hyperjump {
  #config;

  /** @type Record<string, DocumentNode> */
  #cache;

  /** @type Record<string, UriSchemePlugin> */
  #uriSchemePlugins;

  /** @type Record<string, MediaTypePlugin<DocumentNode>> */
  #mediaTypePlugins;

  /**
   * @param {HyperjumpConfig} [config]
   */
  constructor(config = {}) {
    this.#config = config;

    this.#cache = {};

    this.#uriSchemePlugins = {};
    this.#mediaTypePlugins = {};

    // Load default URI scheme plugins
    const httpUriSchemePlugin = new HttpUriSchemePlugin(this);
    this.addUriSchemePlugin("http", httpUriSchemePlugin);
    this.addUriSchemePlugin("https", httpUriSchemePlugin);
    this.addUriSchemePlugin("file", new FileUriSchemePlugin(this));

    // Load default MediaType plugins
    this.addMediaTypePlugin("application/json", new JsonMediaTypePlugin(0.5));
    this.addMediaTypePlugin("application/reference+json", new JrefMediaTypePlugin());
  }

  /** @type (uri: string, options?: FetchOptions) => Promise<JsonCompatible<JrefNode> | undefined> */
  async get(uri, options) {
    const baseUri = contextUri();
    uri = resolveIri(uri, baseUri);
    const id = toAbsoluteIri(uri);
    let { fragment } = parseIri(uri);

    // TODO: Cached and registered should be decoupled

    const cachedDocument = this.#cache[id];
    const embeddedDocument = options?.referencedFrom ? this.#cache[options.referencedFrom].embedded?.[id] : undefined;
    let document = cachedDocument ?? embeddedDocument;

    if (!document) {
      try {
        const response = await this.#retrieve(uri, baseUri);
        document = await this.#parseResponse(response);
        uri = response.url + (fragment === undefined ? "" : `#${fragment}`);
      } catch (error) {
        const referencedMessage = options?.referencedFrom ? ` Referenced from '${options.referencedFrom}'.` : "";
        throw new RetrievalError(`Unable to load resource '${uri}'.${referencedMessage}`, { cause: error });
      }

      this.#cache[id] = document;
    }

    if (document.children[0]) {
      if (document.anchors && fragment !== undefined) {
        fragment = document.anchors[fragment] ?? fragment;
      }
      const cursor = document.fragmentKind === "json-pointer" ? fragment : "";
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const node = document.children[0] ? pointerGet(cursor ?? "", document.children[0]) : undefined;

      return this.#followReferences(node);
    }
  }

  /** @type (node: JrefNode | undefined) => Promise<JsonCompatible<JrefNode> | undefined> */
  async #followReferences(node) {
    if (node?.type === "jref-reference") {
      return this.get(node.value, { referencedFrom: node.documentUri });
    } else {
      return node;
    }
  }

  /** @type (scheme: string, plugin: UriSchemePlugin) => void */
  addUriSchemePlugin(scheme, plugin) {
    this.#uriSchemePlugins[scheme] = plugin;
  }

  /** @type (scheme: string) => void */
  removeUriSchemePlugin(scheme) {
    delete this.#uriSchemePlugins[scheme];
  }

  /** @type (uri: string, baseUri: string) => Promise<Response> */
  async #retrieve(uri, baseUri) {
    uri = resolveIri(uri, baseUri);
    const { scheme } = parseIri(uri);

    if (!(scheme in this.#uriSchemePlugins)) {
      throw new UnsupportedUriSchemeError(scheme, `The '${scheme}:' URI scheme is not supported. Use the 'addUriSchemePlugin' function to add support for '${scheme}:' URIs.`);
    }

    return this.#uriSchemePlugins[scheme].retrieve(uri, baseUri);
  }

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
    if (quality) {
      accept += `; q=${quality}`;
    }

    return accept;
  }

  /** @type (path: string) => Promise<string> */
  async getFileMediaType(path) {
    for (const contentType in this.#mediaTypePlugins) {
      if (await this.#mediaTypePlugins[contentType].fileMatcher(path)) {
        return contentType;
      }
    }

    throw new UnknownMediaTypeError(`The media type of the file at '${path}' could not be determined. Use the 'addMediaTypePlugin' function to add support for this media type.`);
  }

  /** @type <T extends DocumentNode>(contentType: string, plugin: MediaTypePlugin<T>) => void */
  addMediaTypePlugin(contentType, plugin) {
    this.#mediaTypePlugins[contentType] = plugin;
  }

  /** @type (contentType: string) => void */
  removeMediaTypePlugin(contentType) {
    delete this.#mediaTypePlugins[contentType];
  }

  /** @type (contentType: string, quality: number) => void */
  setMediaTypeQuality(contentType, quality) {
    this.#mediaTypePlugins[contentType].quality = quality;
  }

  /** @type (response: Response) => Promise<DocumentNode> */
  #parseResponse(response) {
    const contentTypeText = response.headers.get("content-type");
    if (contentTypeText === null) {
      throw new UnknownMediaTypeError("The media type of the response could not be determined. Make sure the response includes a 'Content-Type' header.");
    }

    const contentType = parseContentType(contentTypeText);
    for (const pattern in this.#mediaTypePlugins) {
      if (mediaTypeMatch(pattern, contentType.type)) {
        return this.#mediaTypePlugins[pattern].parse(response);
      }
    }

    throw new UnsupportedMediaTypeError(contentType.type, `'${contentType.type}' is not supported. Use the 'addMediaTypePlugin' function to add support for this media type.`);
  }

  /** @type (node: JsonCompatible<JrefNode>) => unknown */
  value(node) {
    switch (node.jsonType) {
      case "object":
      case "array":
        throw Error("Can't get the value of a structured value.");
      default:
        return node.value;
    }
  }

  /** @type (node: JsonCompatible<JrefNode>) => JsonType | "undefined" */
  typeOf(node) {
    return node.jsonType ?? "undefined";
  }

  /** @type (key: string, node: JsonCompatible<JrefNode>) => boolean */
  has(key, node) {
    if (node.jsonType === "object") {
      for (const property of node.children) {
        if (property.children[0].value === key) {
          return true;
        }
      }
    }

    return false;
  }

  /** @type (node: JsonCompatible<JrefNode>) => number */
  length(node) {
    switch (node.jsonType) {
      case "array":
        return node.children.length;
      case "string":
        return node.value.length;
      default:
        throw Error("Can't get the length of a value that is not an array or a string.");
    }
  }

  /** @type (key: string, node: JsonCompatible<JrefNode>) => Promise<JsonCompatible<JrefNode> | undefined> */
  async step(key, node) {
    switch (node.jsonType) {
      case "object":
        for (const propertyNode of node.children) {
          if (propertyNode.children[0].value === key) {
            return this.#followReferences(propertyNode.children[1]);
          }
        }
        return;
      case "array":
        return this.#followReferences(node.children[+key]);
      default:
        throw Error("Can't index into a primitive value");
    }
  }

  /** @type (node: JsonCompatible<JrefNode>) => AsyncGenerator<JsonCompatible<JrefNode> | undefined, void, unknown> */
  async * iter(node) {
    if (node.jsonType === "array") {
      for (const itemNode of node.children) {
        yield this.#followReferences(itemNode);
      }
    }
  }

  /** @type (node: JsonCompatible<JrefNode>) => Generator<string, undefined, string> */
  * keys(node) {
    if (node.jsonType === "object") {
      for (const propertyNode of node.children) {
        yield propertyNode.children[0].value;
      }
    }
  }

  /** @type (node: JsonCompatible<JrefNode>) => AsyncGenerator<JsonCompatible<JrefNode> | undefined, void, unknown> */
  async * values(node) {
    if (node.jsonType === "object") {
      for (const propertyNode of node.children) {
        yield this.#followReferences(propertyNode.children[1]);
      }
    }
  }

  /** @type (node: JsonCompatible<JrefNode>) => AsyncGenerator<[string, JsonCompatible<JrefNode> | undefined], void, unknown> */
  async * entries(node) {
    if (node.jsonType === "object") {
      for (const propertyNode of node.children) {
        yield [propertyNode.children[0].value, await this.#followReferences(propertyNode.children[1])];
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

export class UnsupportedUriSchemeError extends Error {
  /**
   * @param {string} scheme
   * @param {string} [message]
   */
  constructor(scheme, message = undefined) {
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
  constructor(mediaType, message = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.mediaType = mediaType;
  }
}

export class UnknownMediaTypeError extends Error {
  /**
   * @param {string} [message]
   */
  constructor(message = undefined) {
    super(message);
    this.name = this.constructor.name;
  }
}
