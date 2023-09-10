import { get as pointerGet } from "@hyperjump/json-pointer";
import { resolveIri } from "@hyperjump/uri";
import { contextUri } from "./base-uri.js";
import { retrieve } from "../uri-schemes/uri-schemes.js";
import { parseResponse } from "../media-types/media-types.js";
import { Reference } from "../jref/index.js";


export const get = async (uri, document = undefined) => {
  const baseUri = document ? document.baseUri : contextUri();
  uri = resolveIri(uri, baseUri);

  const { response, fragment } = await retrieve(uri, document);
  const responseDocument = await parseResponse(response, fragment);
  responseDocument._value = pointerGet(responseDocument.cursor, responseDocument.root);

  return responseDocument._value instanceof Reference
    ? get(responseDocument._value.href, responseDocument)
    : responseDocument;
};

export const value = (document) => document._value;
