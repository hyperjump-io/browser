import { get as pointerGet, append as pointerAppend } from "@hyperjump/json-pointer";
import { parseIri, resolveIri, toAbsoluteIri } from "@hyperjump/uri";
import { contextUri } from "./context-uri.js";
import { retrieve } from "../uri-schemes/uri-schemes.js";
import { parseResponse } from "../media-types/media-types.js";
import { jrefTypeOf } from "../jref/index.js";


export const get = async (uri, browser = { _cache: {} }) => {
  const baseUri = browser.document?.baseUri ?? contextUri();
  const { id, fragment, ...resolved } = resolveUri(uri, baseUri, browser.document);
  uri = resolved.uri;

  const cachedDocument = browser._cache[id] ?? browser.document?.embedded?.[id];
  if (cachedDocument) {
    browser.document = cachedDocument;
    browser.uri = uri;
    browser.cursor = browser.document.anchorLocation(fragment);
  } else {
    try {
      const response = await retrieve(uri, baseUri);
      browser.document = await parseResponse(response);
      browser.uri = response.url + (fragment === undefined ? "" : `#${fragment}`);
      browser.cursor = browser.document.anchorLocation(fragment);
    } catch (error) {
      const referencedMessage = browser.uri ? ` Referenced from '${browser.uri}'.` : "";
      throw new RetrievalError(`Unable to load resource '${uri}'.${referencedMessage}`, error);
    }

    browser._cache[id] = browser.document;
  }

  browser._value = pointerGet(browser.cursor, browser.document.root);

  return followReferences(browser);
};

/**
 * Resolving a URI takes several full IRI parses. The same references are followed many times from the same document,
 * so results are cached per document. Results only depend on the URI and the base URI, so they're always the same as
 * resolving again. Invalid URIs throw and aren't cached.
 */
const resolvedUris = new WeakMap();
const resolveUri = (uri, baseUri, document) => {
  if (document === undefined) {
    return resolve(uri, baseUri);
  }

  let documentCache = resolvedUris.get(document);
  if (documentCache === undefined) {
    documentCache = new Map();
    resolvedUris.set(document, documentCache);
  }

  const key = `${baseUri} ${uri}`;
  let resolved = documentCache.get(key);
  if (resolved === undefined) {
    resolved = resolve(uri, baseUri);
    documentCache.set(key, resolved);
  }

  return resolved;
};

const resolve = (uri, baseUri) => {
  const resolvedUri = resolveIri(uri, baseUri);
  return {
    uri: resolvedUri,
    id: toAbsoluteIri(resolvedUri),
    fragment: parseIri(resolvedUri).fragment
  };
};

const followReferences = (browser) => jrefTypeOf(value(browser)) === "reference"
  ? get(value(browser).href, browser)
  : browser;

export const value = (browser) => browser._value;

export const typeOf = (browser) => jrefTypeOf(browser._value);
export const has = (key, browser) => key in browser._value;
export const length = (browser) => browser._value.length;

// Curried by hand because a generic curry function adds noticeable overhead to every call
export const step = function (key, browser) {
  if (arguments.length >= 2) {
    return _step(key, browser);
  } else if (arguments.length === 1) {
    return (browser) => _step(key, browser);
  } else {
    return step;
  }
};

const _step = (key, browser) => {
  return followReferences({
    ...browser,
    cursor: pointerAppend(`${key}`, browser.cursor),
    _value: browser._value[key]
  });
};

export const iter = async function* (browser) {
  for (let index = 0; index < value(browser).length; index++) {
    yield _step(index, browser);
  }
};

export const keys = function* (browser) {
  for (const key in value(browser)) {
    yield key;
  }
};

export const values = async function* (browser) {
  for (const key in value(browser)) {
    yield _step(key, browser);
  }
};

export const entries = async function* (browser) {
  for (const key in value(browser)) {
    const stepped = _step(key, browser);
    // Only following a reference returns a promise. Awaiting anything else would add an unnecessary microtask.
    yield [key, stepped instanceof Promise ? await stepped : stepped];
  }
};

export class RetrievalError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = this.constructor.name;
  }
}
