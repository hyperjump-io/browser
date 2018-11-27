import makeFetchHappen from "make-fetch-happen";
import "babel-polyfill";
import Promise from "bluebird";
import { resolve as resolveUrl } from "url";
import * as JsonPointer from "@hyperjump/json-pointer";


const construct = (url, headers, content) => Object.freeze({ url, headers, content });

export const nil = construct("", {}, undefined);

export const value = (doc) => JsonPointer.get(pointer(doc))(doc.content);

export const pointer = (doc) => decodeURIComponent(uriFragment(doc.url));

export const get = async (url, doc = nil) => {
  let result = await fetch(doc, url, { headers: { "Accept": "application/reference+json" } });
  const resultContentType = result.headers["content-type"];
  if ("application/reference+json" !== resultContentType) {
    throw Error(`${result.url} has unsupported Content-Type: ${resultContentType}`);
  }

  let resultValue = value(result);

  if (isId(resultValue)) {
    const id = resultValue["$id"];
    delete resultValue["$id"];
    // TODO: Cache embedded document. I'll probably need to implement my own HTTP Cache for this.
    result = construct(id, {}, resultValue);
    resultValue = value(result);
  }

  return isRef(resultValue) ? await get(resultValue["$ref"], result) : result;
};

const fetch = async (doc, url, options = {}) => {
  const resolvedUrl = resolveUrl(doc.url, url);

  if (uriReference(doc.url) === uriReference(resolvedUrl)) {
    return construct(resolvedUrl, doc.headers, doc.content);
  } else {
    const response = await _fetch(resolvedUrl, options);
    const headers = {};
    for (let [name, value] of response.headers.entries()) {
      headers[name] = value;
    }
    return construct(resolvedUrl, headers, await response.json());
  }
};

const _fetch = makeFetchHappen.defaults({ cacheManager: "./http-cache" });

const uriReference = (url) => url.split("#", 1)[0];
const uriFragment = (url) => url.split("#", 2)[1] || "";
const isObject = (value) => typeof value === "object" && !Array.isArray(value) && value !== null;
const isRef = (value) => isObject(value) && "$ref" in value;
const isId = (value) => isObject(value) && "$id" in value;

export const entries = async (doc) => {
  const items = Object.keys(value(doc))
    .map(async (key) => {
      const url = append(doc, key);
      return [key, await get(url, doc)];
    });

  return await Promise.all(items);
};

export const map = async (fn, doc) => {
  const items = Object.keys(value(doc))
    .map((key) => {
      const url = append(doc, key);
      return get(url, doc);
    });

  return await Promise.map(items, fn);
};

const append = (doc, key) => "#" + encodeURI(JsonPointer.append(pointer(doc), key));
