import { get as pointerGet, append as pointerAppend } from "@hyperjump/json-pointer";
import { resolveIri, parseIri, toAbsoluteIri } from "@hyperjump/uri";
import { contextUri } from "./base-uri.js";
import { retrieve } from "../uri-schemes/uri-schemes.js";
import { parseResponse } from "../media-types/media-types.js";
import { Reference } from "../jref/index.js";


export const get = async (uri, document = undefined) => {
  const baseUri = document ? document.baseUri : contextUri();
  uri = resolveIri(uri, baseUri);

  let responseDocument;
  if (document && toAbsoluteIri(uri) === document.baseUri) {
    const { fragment } = parseIri(uri);
    responseDocument = {
      ...document,
      cursor: fragment,
      _value: pointerGet(document.cursor, document.root)
    };
  } else {
    const { response, fragment } = await retrieve(uri, document);
    responseDocument = await parseResponse(response, fragment);
    responseDocument._value = pointerGet(responseDocument.cursor, responseDocument.root);
  }

  return followReferences(responseDocument);
};

const followReferences = (document) => document._value instanceof Reference
  ? get(document._value.href, document)
  : document;

export const value = (document) => document._value;

export const step = (key, document) => {
  return followReferences({
    ...document,
    cursor: pointerAppend(`${key}`, document.cursor),
    _value: document._value[key]
  });
};
