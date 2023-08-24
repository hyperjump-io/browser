import { get as pointerGet } from "@hyperjump/json-pointer";
import { resolveIri } from "@hyperjump/uri";
import { retrieve } from "./uri-schemes.js";
import { parseResponse } from "./media-types.js";
import { Reference } from "./jref/index.js";


export const get = async (uri, document = undefined) => {
  const baseUri = document ? document.baseUri : callerUri();
  uri = resolveIri(uri, baseUri);

  const { response, fragment } = await retrieve(uri, document);
  const responseDocument = await parseResponse(response, fragment);
  responseDocument._value = pointerGet(responseDocument.cursor, responseDocument.root);

  return responseDocument._value instanceof Reference
    ? get(responseDocument._value.href, responseDocument)
    : responseDocument;
};

const callerUri = () => {
  const stackLine = Error().stack.split("\n")[3];
  const stackLineMatcher = /\((.*):\d+:\d+\)/;
  const matches = stackLineMatcher.exec(stackLine);
  return matches[1];
};

export const value = (document) => document._value;
