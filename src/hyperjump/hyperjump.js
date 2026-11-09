import { contextUrl } from "#context-url";
import { defaultUrlSchemePlugins } from "#default-url-scheme-plugins";
import { JsonMediaTypePlugin } from "./media-types/json-media-type-plugin.js";
import { JrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.js";
import { jsonPointerGet } from "../json/jsonast-util.js";
import { acceptHeader, fragmentPointer, mediaTypeByExtension, mediaTypePluginFor } from "./media-type-plugins.js";
import { AllowedUrls, allowRetrievalLayer, configSource, resolveAllowRetrieval, sessionSource } from "./allowed-urls.js";
import { compose } from "./layers.js";
import { problemDetail } from "./problem-details.js";
import { relativeFileUrl } from "./file-urls.js";
import { withoutFragment } from "./url-parts.js";
import { urlSchemesFetch } from "./url-schemes/url-schemes-fetch.js";

/**
 * @import { JrefNode } from "../jref/jref-ast.d.ts"
 * @import { UrlSchemePlugin } from "./url-schemes/url-scheme-plugin.d.ts"
 * @import { DocumentNode, MediaTypePlugin, RetrievedResponse } from "./media-types/media-type-plugin.d.ts"
 * @import { FollowedNode } from "./browsing.d.ts"
 * @import { Fetch } from "./layers.js"
 * @import * as API from "./hyperjump.d.ts"
 * @import { RetrieveOptions } from "./url-schemes/url-scheme-plugin.d.ts"
 */

/** @typedef {Omit<RetrieveOptions, "accept" | "mediaTypeByExtension">} ParsedGetOptions */

/**
 * Redirects are followed this many times, like `fetch` does, so a redirect
 * cycle fails instead of going on forever
 */
const maxRedirects = 20;

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/** The statuses whose response is a representation the session can parse */
const successStatuses = new Set([200, 203]);

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
   * @type Map<string, UrlSchemePlugin>
   */
  #urlSchemePlugins;

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
      resolveAllowRetrieval(config.allowRetrieval, contextUrl(), configSource);
    }

    // A frozen copy, so a change to the object it was given, after it was
    // checked, doesn't change what new sessions allow
    this.#config = Object.freeze({
      ...config,
      allowRetrieval: frozenCopy(config.allowRetrieval),
      urlSchemePlugins: frozenCopy(config.urlSchemePlugins),
      mediaTypePlugins: frozenCopy(config.mediaTypePlugins)
    });

    // The config's plugins come after the defaults, and a later plugin for a
    // scheme or media type replaces an earlier one. A replacement keeps its
    // place, which is the order of the Accept header and of ties.
    this.#urlSchemePlugins = new Map();
    for (const plugin of [...defaultUrlSchemePlugins(), ...config.urlSchemePlugins ?? []]) {
      // A scheme is case-insensitive
      for (const scheme of plugin.schemes) {
        this.#urlSchemePlugins.set(scheme.toLowerCase(), plugin);
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

  get urlSchemePlugins() {
    return this.#urlSchemePlugins;
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
   * Documents by URL, without its fragment. Parsing a URL normalizes it, so
   * equivalent URLs, like ones written with a different case, are one
   * document. The promise is cached so a document that's requested again
   * while it's being retrieved is only retrieved once.
   *
   * @type Record<string, Promise<DocumentNode>>
   */
  #cache;

  /**
   * The session's stack, which everything it retrieves is requested from
   *
   * @type Fetch
   */
  #fetch;

  /**
   * What relative URLs are resolved against, as it was when the session was
   * created, so it's the same for everything the session does. A new
   * session sees a change, like any other. There's none where there's no
   * document, such as in a worker.
   *
   * @type string | undefined
   */
  #contextUrl;

  /**
   * @param {Hyperjump} hyperjump
   * @param {API.SessionOptions} [options]
   */
  constructor(hyperjump, options = {}) {
    this.#hyperjump = hyperjump;
    this.#cache = {};
    this.#contextUrl = contextUrl();

    // Where the session's `allowRetrieval` came from, so a refusal says which
    // list to change. A session's own list replaces the config's, so adding
    // to the config wouldn't allow it.
    const [allowRetrieval, source] = options.allowRetrieval === undefined
      ? [hyperjump.config.allowRetrieval, configSource]
      : [options.allowRetrieval, sessionSource];
    const allowedUrls = new AllowedUrls(allowRetrieval === undefined ? undefined : resolveAllowRetrieval(allowRetrieval, this.#contextUrl, source), this.#contextUrl);

    const { mediaTypePlugins } = hyperjump;
    this.#fetch = compose(
      [allowRetrievalLayer((url) => allowedUrls.allows(url), source)],
      urlSchemesFetch(hyperjump.urlSchemePlugins, hyperjump.accept, (url) => mediaTypeByExtension(mediaTypePlugins, url))
    );
  }

  get hyperjump() {
    return this.#hyperjump;
  }

  /** @type API.Session<JrefNode>["get"] */
  async get(url, options = {}) {
    return this.#get(this.#resolve(url), parseGetOptions(options), []);
  }

  /**
   * @param {string} url - An `href`
   * @param {ParsedGetOptions} options
   * @param {string[]} referenceChain - URLs of the references followed to get here
   * @returns {Promise<FollowedNode>}
   */
  async #get(url, options, referenceChain) {
    if (referenceChain.includes(url)) {
      throw new ReferenceCycleError([...referenceChain, url]);
    }
    referenceChain = [...referenceChain, url];

    // Subclasses can override getDocument, so every lookup goes through it
    const document = await this.getDocument(url, options);

    const fragmentStart = url.indexOf("#");
    const cursor = fragmentStart === -1 ? "" : this.#hyperjump.fragmentPointer(document, url.slice(fragmentStart + 1));
    const node = jsonPointerGet(cursor, document.children[0]);
    if (node.type === "reference") {
      // A media type plugin can be an application's, so what it gives a
      // reference is parsed, like anything else from outside
      return this.#get(this.#resolve(node.href), parseGetOptions({ referencedFrom: withoutFragment(node.location) }), referenceChain);
    } else {
      return node;
    }
  }

  /**
   * A URL from outside, parsed, and resolved against the session's context
   * URL if it's relative
   *
   * @type (url: string) => string
   */
  #resolve(url) {
    const absolute = URL.parse(url);
    if (absolute) {
      return absolute.href;
    } else if (this.#contextUrl === undefined) {
      throw TypeError(`'${url}' is relative, and there's nothing to resolve it against here. Use an absolute URL.`);
    } else {
      return new URL(url, this.#contextUrl).href;
    }
  }

  /**
   * The document is retrieved and cached by its URL without its fragment.
   *
   * @type API.Session<JrefNode>["getDocument"]
   */
  async getDocument(url, options = {}) {
    const id = withoutFragment(this.#resolve(url));
    const parsedOptions = parseGetOptions(options);

    this.#cache[id] ??= this.#retrieveDocument(id, parsedOptions).catch((/** @type unknown */ error) => {
      // A failure isn't cached, so it can be tried again
      delete this.#cache[id];
      throw error;
    });

    return this.#cache[id];
  }

  /**
   * A plugin's redirect is followed here, with a request down the whole
   * stack, so where it leads is checked by `allowRetrieval` before it's
   * retrieved, and its retrieval is given the same options. A response the
   * session can't parse, like a refusal or a server's 404, is an
   * `HttpError`, explained by its Problem Details `detail` if it has one.
   *
   * @type (id: string, options: ParsedGetOptions) => Promise<DocumentNode>
   */
  async #retrieveDocument(id, options) {
    let response;
    let url = id;
    for (let redirects = 0; ; redirects++) {
      try {
        response = await this.#retrieve(url, options);
      } catch (error) {
        throw new RetrievalError(id, { cause: error });
      }

      const location = redirectStatuses.has(response.status) ? response.headers.get("location") : null;
      if (location === null) {
        break;
      }

      await response.body?.cancel();
      if (redirects === maxRedirects) {
        throw new RetrievalError(id, { cause: Error(`It was redirected more than ${maxRedirects} times`) });
      }

      // `retrieve` gives every response a URL. The `Location` comes from
      // outside, so it's parsed. The fragment isn't part of what's
      // retrieved.
      try {
        url = withoutFragment(new URL(location, response.url).href);
      } catch (error) {
        throw new RetrievalError(id, { cause: error });
      }
    }

    const responseUrl = response.url;
    try {
      if (!successStatuses.has(response.status)) {
        throw new HttpError(response, await problemDetail(response));
      }

      const document = await this.#parseResponse(response);

      // References within the document are relative to the URL it was
      // retrieved from, which can differ from the requested URL (redirects,
      // symlinks), so it needs to be cached under both.
      this.#cache[responseUrl] ??= Promise.resolve(document);

      return document;
    } catch (error) {
      throw new RetrievalError(id, { cause: error });
    }
  }

  /**
   * Retrieve through the session's stack. `referencedFrom` is the request's
   * `Referer`. The bottom of the stack gives every response a URL, without
   * its fragment, so a redirect's `Location` can be relative to it and a
   * media type plugin has it.
   *
   * @type (url: string, options: ParsedGetOptions) => Promise<RetrievedResponse>
   */
  async #retrieve(url, options) {
    const headers = new Headers();
    if (options.referencedFrom !== undefined) {
      headers.set("referer", options.referencedFrom);
    }

    return this.#fetch(new Request(url, { headers }));
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
}

/**
 * The options given to `get` or `getDocument` come from outside, like the
 * URL, so `referencedFrom` is parsed. One from a reference that's followed
 * is parsed again, which is cheap.
 *
 * @type (options: API.GetOptions) => ParsedGetOptions
 */
const parseGetOptions = (options) => {
  return options.referencedFrom === undefined ? {} : { referencedFrom: withoutFragment(new URL(options.referencedFrom).href) };
};

export class RetrievalError extends Error {
  /**
   * @param {string} url
   * @param {{ cause: unknown }} options
   */
  constructor(url, options) {
    super(`Unable to load resource '${relativeFileUrl(url)}'`, options);
    this.name = this.constructor.name;
    this.url = url;
  }
}

export class FileNotFoundError extends Error {
  /**
   * @param {string} url
   */
  constructor(url) {
    super(`There's no file at '${relativeFileUrl(url)}'`);
    this.name = this.constructor.name;
    this.url = url;
  }
}

export class ReferenceCycleError extends Error {
  /** @type string[] */
  referenceChain;

  /**
   * @param {string[]} referenceChain
   */
  constructor(referenceChain) {
    super(`Reference cycle: ${referenceChain.map(relativeFileUrl).join(" -> ")}`);
    this.name = this.constructor.name;
    this.referenceChain = referenceChain;
  }
}

export class UnsupportedUrlSchemeError extends Error {
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

export class HttpError extends Error {
  /**
   * @param {Response} response
   * @param {string} [message]
   */
  constructor(response, message) {
    super(`${response.status} ${response.statusText}${message ? ` -- ${message}` : ""}`);
    this.name = this.constructor.name;
    this.response = response;
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
