import { parseIri, resolveIri, toAbsoluteIri } from "@hyperjump/uri";
import { parse as parseContentType } from "content-type";
import { contextUri } from "./context-uri.js";
import { HttpUriSchemePlugin } from "./uri-schemes/http-scheme-plugin.js";
import { FileUriSchemePlugin } from "./uri-schemes/file-scheme-plugin.js";
import { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.js";
import { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.js";
import { pointerGet, pointerStep } from "../jref/jref-util.js";
import { jsonObjectHas, jsonObjectKeys, jsonTypeOf, jsonValue } from "../json/jsonast-util.js";
import { mimeMatch } from "./utilities.js";

/**
 * @import { JrefNode } from "../jref/jref-ast.js"
 * @import { JsonCompatible } from "../json/jsonast.js"
 * @import { UriSchemePlugin } from "./uri-schemes/uri-scheme-plugin.js"
 * @import { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.js"
 * @import { JsonPointerError } from "../json/jsonast-util.js"
 */


/**
 * @typedef {{}} HyperjumpConfig
 */

// TODO: Support fetch options in get
/**
 * @typedef {{
 *   referencedFrom?: string;
 * }} GetOptions
 */

// TODO: Support filters

export class Hyperjump {
  // TODO: Add config to enable schemes and media types
  #config;

  /** @type Record<string, DocumentNode> */
  #cache;

  /** @type Record<string, UriSchemePlugin> */
  #uriSchemePlugins;

  /** @type Record<string, MediaTypePlugin<DocumentNode>> */
  #mediaTypePlugins;

  /** @type GetOptions */
  #defaultGetOptions;

  /**
   * @param {HyperjumpConfig} [config]
   */
  constructor(config = {}) {
    this.#config = config;

    this.#cache = {};

    this.#uriSchemePlugins = {};
    this.#mediaTypePlugins = {};

    this.#defaultGetOptions = {};

    // Load default URI scheme plugins
    this.addUriSchemePlugin(new HttpUriSchemePlugin(this));
    this.addUriSchemePlugin(new FileUriSchemePlugin(this));

    // Load default MediaType plugins
    this.addMediaTypePlugin(new JrefMediaTypePlugin());
    this.addMediaTypePlugin(new JsonMediaTypePlugin());
  }

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
   * @type (uri: string, options?: GetOptions) => Promise<JsonCompatible<JrefNode>>
   * @throws &nbsp;{@link RetrievalError}
   * @throws &nbsp;{@link JsonPointerError}
   */
  async get(uri, options = this.#defaultGetOptions) {
    uri = resolveIri(uri, contextUri());
    const id = toAbsoluteIri(uri);
    let { fragment } = parseIri(uri);

    // TODO: How should cache work?

    const cachedDocument = this.#cache[id];
    const embeddedDocument = options?.referencedFrom ? this.#cache[options.referencedFrom].embedded?.[id] : undefined;
    let document = cachedDocument ?? embeddedDocument;

    if (!document) {
      try {
        const response = await this.retrieve(uri, options);
        document = await this.#parseResponse(response);
        uri = response.url + (fragment === undefined ? "" : `#${fragment}`);
      } catch (error) {
        throw new RetrievalError(`Unable to load resource '${uri}'`, { cause: error });
      }

      this.#cache[id] = document;
    }

    if (document.anchors && fragment !== undefined) {
      fragment = document.anchors[fragment] ?? fragment;
    }
    const cursor = document.fragmentKind === "json-pointer" ? fragment : "";

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const node = pointerGet(cursor ?? "", document.children[0], document.uri);
    return await this.#followReferences(node);
  }

  /** @type (node: JrefNode) => Promise<JsonCompatible<JrefNode>> */
  async #followReferences(node) {
    if (node?.type === "jref-reference") {
      return this.get(node.value, { referencedFrom: node.documentUri });
    } else {
      return node;
    }
  }

  /**
   * Add support for a
   * {@link https://www.rfc-editor.org/rfc/rfc3986#section-3.1 | URI scheme}.
   * Support for the {@link HttpUriSchemePlugin | `http(s):`} and
   * {@link FileUriSchemePlugin | `file:`} URI schemes are enabled by default.
   *
   * @type (plugin: UriSchemePlugin) => void
   */
  addUriSchemePlugin(plugin) {
    for (const scheme of plugin.schemes) {
      this.#uriSchemePlugins[scheme] = plugin;
    }
  }

  /**
   * This is mostly useful for disabling a scheme that's enabled by default.
   *
   * @type (scheme: string) => void
   */
  removeUriSchemePlugin(scheme) {
    delete this.#uriSchemePlugins[scheme];
  }

  /**
   * Unless you're using it in a {@link UriSchemePlugin.retrieve} method, this
   * is not the method you're looking for. It's used internally to fetch a
   * resource before processing it based on its media type. You might use it for
   * implementing {@link UriSchemePlugin}s for URI schemes that don't have
   * locating semantics (such as `urn:`) and instead map to another URI where
   * the resource can be retrieved from. See the example in the README.
   *
   * @type (uri: string, options: GetOptions) => Promise<Response>
   */
  async retrieve(uri, options) {
    const { scheme } = parseIri(uri);

    if (!(scheme in this.#uriSchemePlugins)) {
      throw new UnsupportedUriSchemeError(scheme, `The '${scheme}:' URI scheme is not supported. Use the 'addUriSchemePlugin' function to add support for '${scheme}:' URIs.`);
    }

    return this.#uriSchemePlugins[scheme].retrieve(uri, options);
  }

  /**
   * Constructs an `Accept` header based on the registered media types.
   *
   * @type () => string
   */
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

  /**
   * Returns the media type of the resource based on its URI. This is usually
   * based on the extension and configured by {@link MediaTypePlugin}s.
   *
   * @type (uri: string) => string
   */
  getMediaType(uri) {
    for (const contentType in this.#mediaTypePlugins) {
      for (const extension of this.#mediaTypePlugins[contentType].extensions) {
        if (uri.endsWith(extension)) {
          if (extension.startsWith("/") || extension.startsWith(".") && uri[uri.length - extension.length - 1] !== "/") {
            return contentType;
          }
        }
      }
    }

    throw new UnknownMediaTypeError(`The media type of the file at '${uri}' could not be determined. Use the 'addMediaTypePlugin' function to add support for this media type.`);
  }

  /**
   * Add support for a media tpe. Support for the
   * {@link JrefMediaTypePlugin | `JRef`} and
   * {@link JsonMediaTypePlugin | `JSON`} media types are enabled by default.
   *
   * @type <T extends DocumentNode>(plugin: MediaTypePlugin<T>) => void
   */
  addMediaTypePlugin(plugin) {
    this.#mediaTypePlugins[plugin.mediaType] = plugin;
  }

  /**
   * This is mostly useful for disabling a scheme that's enabled by default.
   *
   * @type (contentType: string) => void
   */
  removeMediaTypePlugin(contentType) {
    delete this.#mediaTypePlugins[contentType];
  }

  /**
   * Set the
   * {@link https://developer.mozilla.org/en-US/docs/Glossary/Quality_values | quality}
   * that will be used in the Accept header of requests to indicate to servers
   * which media types are preferred over others.
   *
   * @type (contentType: string, quality: number) => void
   */
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
      if (mimeMatch(pattern, contentType.type)) {
        return this.#mediaTypePlugins[pattern].parse(response);
      }
    }

    throw new UnsupportedMediaTypeError(contentType.type, `'${contentType.type}' is not supported. Use the 'addMediaTypePlugin' function to add support for this media type.`);
  }

  value = jsonValue;
  typeOf = jsonTypeOf;
  has = jsonObjectHas;

  /**
   * This is like indexing into an object or array. It will follow any
   * references it encounters so it always returns a JSON compatible value.
   *
   * @type (key: string, node: JsonCompatible<JrefNode>) => Promise<JsonCompatible<JrefNode>>
   */
  async step(key, node) {
    return await this.#followReferences(pointerStep(key, node));
  }

  /**
   * Iterate over an array node. It will follow any references it encounters so
   * it always yields JSON compatible values.
   *
   * @type (node: JsonCompatible<JrefNode>) => AsyncGenerator<JsonCompatible<JrefNode>, void, unknown>
   */
  async * iter(node) {
    if (node.jsonType === "array") {
      for (const itemNode of node.children) {
        yield this.#followReferences(itemNode);
      }
    }
  }

  keys = jsonObjectKeys;

  /**
   * Iterate over the values of an object. It will follow any references it
   * encounters so it always yields JSON compatible values.
   *
   * @type (node: JsonCompatible<JrefNode>) => AsyncGenerator<JsonCompatible<JrefNode>, void, unknown>
   */
  async * values(node) {
    if (node.jsonType === "object") {
      for (const propertyNode of node.children) {
        yield this.#followReferences(propertyNode.children[1]);
      }
    }
  }

  /**
   * Iterate over key/value pairs of an object. It will follow any references it
   * encounters so it always yields JSON compatible values.
   *
   * @type (node: JsonCompatible<JrefNode>) => AsyncGenerator<[string, JsonCompatible<JrefNode>], void, unknown>
   */
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
