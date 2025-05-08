import type { JsonCompatible } from "../json/jsonast.d.ts";
import type { JrefNode } from "../jref/jref-ast.d.ts";
import type { UriSchemePlugin } from "./uri-schemes/uri-scheme-plugin.d.ts";
import type { DocumentNode, MediaTypePlugin } from "./media-types/media-type-plugin.d.ts";
import type { jsonObjectHas, jsonObjectKeys, jsonValue } from "../json/jsonast-util.js";


export type HyperjumpConfig = object;

export type GetOptions = {
  referencedFrom?: string;
};

export class Hyperjump<T extends JrefNode = JrefNode> {
  constructor(config?: HyperjumpConfig);

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
   * @throws {@link RetrievalError}
   * @throws {@link json.JsonPointerError}
   */
  get: (uri: string, options?: GetOptions) => Promise<JsonCompatible<T>>;

  /**
   * Add support for a
   * {@link https://www.rfc-editor.org/rfc/rfc3986#section-3.1 | URI scheme}.
   * Support for the {@link HttpUriSchemePlugin | `http(s):`} and
   * {@link FileUriSchemePlugin | `file:`} URI schemes are enabled by default.
   */
  addUriSchemePlugin: (plugin: UriSchemePlugin) => void;

  /**
   * This is mostly useful for disabling a scheme that's enabled by default.
   */
  removeUriSchemePlugin: (scheme: string) => void;

  /**
   * Unless you're using it in a {@link UriSchemePlugin.retrieve} method, this
   * is not the method you're looking for. It's used internally to fetch a
   * resource before processing it based on its media type. You might use it for
   * implementing {@link hyperjump.UriSchemePlugin}s for URI schemes that don't
   * have locating semantics (such as `urn:`) and instead map to another URI
   * where the resource can be retrieved from. See the example in the README.
   */
  retrieve: (uri: string, options: GetOptions) => Promise<Response>;

  /**
   * Constructs an `Accept` header based on the registered media types.
   */
  acceptableMediaTypes: () => string;

  /**
   * Returns the media type of the resource based on its URI. This is usually
   * based on the extension and configured by {@link hyperjump.MediaTypePlugin}s.
   */
  getMediaType: (uri: string) => string;

  /**
   * Add support for a media tpe. Support for the
   * {@link hyperjump.JrefMediaTypePlugin | `JRef`} and
   * {@link hyperjump.JsonMediaTypePlugin | `JSON`} media types are enabled by
   * default.
   */
  addMediaTypePlugin: <T extends DocumentNode>(plugin: MediaTypePlugin<T>) => void;

  /**
   * This is mostly useful for disabling a scheme that's enabled by default.
   */
  removeMediaTypePlugin: (contentType: string) => void;

  /**
   * Set the
   * {@link https://developer.mozilla.org/en-US/docs/Glossary/Quality_values | quality}
   * that will be used in the Accept header of requests to indicate to servers
   * which media types are preferred over others.
   */
  setMediaTypeQuality: (contentType: string, quality: number) => void;

  value: typeof jsonValue;
  has: typeof jsonObjectHas;

  /**
   * This is like indexing into an object or array. It will follow any
   * references it encounters so it always returns a JSON compatible value.
   */
  step: (key: string, node: JsonCompatible<T>) => Promise<JsonCompatible<T>>;

  /**
   * Iterate over an array node. It will follow any references it encounters so
   * it always yields JSON compatible values.
   */
  iter: (node: JsonCompatible<T>) => AsyncGenerator<JsonCompatible<T>, void, unknown>;

  keys: typeof jsonObjectKeys;

  /**
   * Iterate over the values of an object. It will follow any references it
   * encounters so it always yields JSON compatible values.
   */
  values: (node: JsonCompatible<T>) => AsyncGenerator<JsonCompatible<T>, void, unknown>;

  /**
   * Iterate over key/value pairs of an object. It will follow any references it
   * encounters so it always yields JSON compatible values.
   */
  entries: (node: JsonCompatible<T>) => AsyncGenerator<[string, JsonCompatible<T>], void, unknown>;
}

export class RetrievalError extends Error {
  constructor(message: string, options: { cause: unknown });
}

export class UnsupportedUriSchemeError extends Error {
  constructor(scheme: string, message?: string);
}

export class UnsupportedMediaTypeError extends Error {
  mediaType: string;

  constructor(mediaType: string, message?: string);
}

export class UnknownMediaTypeError extends Error {
  constructor(message?: string);
}
