import curry from "just-curry-it";
import { get as pointerGet, append as pointerAppend } from "@hyperjump/json-pointer";
import { parseIri, resolveIri, toAbsoluteIri } from "@hyperjump/uri";
import { contextUri } from "./context-uri.js";
import { retrieve } from "../uri-schemes/uri-schemes.js";
import { parseResponse } from "../media-types/media-types.js";
import { jrefTypeOf } from "../jref/index.js";


export const get = async (uri, browser = { _cache: {} }) => {
  const baseUri = browser.document ? browser.document.baseUri : contextUri();
  uri = resolveIri(uri, baseUri);
  const id = toAbsoluteIri(uri);

  const cacheEntry = browser._cache[id];
  const cachedDocument = cacheEntry?.source !== "registry"
    && browser.document?.embedded?.[id]
    || cacheEntry?.document;
  if (cachedDocument) {
    browser.document = cachedDocument;
    browser.uri = uri;
    const { fragment } = parseIri(uri);
    browser.cursor = browser.document.anchorLocation(fragment);
  } else {
    try {
      const { response, fragment } = await retrieve(uri, baseUri);
      browser.document = await parseResponse(response);
      browser.uri = response.url + (fragment === undefined ? "" : `#${fragment}`);
      browser.cursor = fragment === undefined ? "" : browser.document.anchorLocation(fragment);
    } catch (error) {
      const referencedMessage = browser.uri ? ` Referenced from '${browser.uri}'.` : "";
      throw new RetrievalError(`Unable to load resource '${uri}'.${referencedMessage}`, error);
    }

    const { scheme } = parseIri(browser.uri);
    browser._cache[id] = { source: scheme, document: browser.document };
  }

  browser._value = pointerGet(browser.cursor, browser.document.root);

  return followReferences(browser);
};

const followReferences = (browser) => jrefTypeOf(value(browser)) === "reference"
  ? get(value(browser).href, browser)
  : browser;

export const value = (browser) => browser._value;

export const step = curry((key, browser) => {
  return followReferences({
    ...browser,
    cursor: pointerAppend(`${key}`, browser.cursor),
    _value: browser._value[key]
  });
});

export const iter = async function* (browser) {
  for (let index = 0; index < value(browser).length; index++) {
    yield step(index, browser);
  }
};

export const keys = function* (browser) {
  for (const key in value(browser)) {
    yield key;
  }
};

export const values = async function* (browser) {
  for (const key in value(browser)) {
    yield step(key, browser);
  }
};

export const entries = async function* (browser) {
  for (const key in value(browser)) {
    yield [key, await step(key, browser)];
  }
};

export class RetrievalError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = this.constructor.name;
  }
}
