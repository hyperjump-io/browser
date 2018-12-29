import makeFetchHappen from "make-fetch-happen";
import "babel-polyfill";
import { resolve as resolveUrl } from "url";


export const construct = (url, headers, body) => Object.freeze({ url, headers, body });

export const nil = construct("", {}, undefined);

export const get = async (url, doc = nil, options = {}) => {
  let result;
  const resolvedUrl = resolveUrl(doc.url, url);

  if (uriReference(doc.url) === uriReference(resolvedUrl)) {
    result = construct(resolvedUrl, doc.headers, doc.body);
  } else {
    const response = await fetch(resolvedUrl, options);
    const headers = {};
    for (const [name, value] of response.headers.entries()) {
      headers[name] = value;
    }
    result = construct(resolvedUrl, headers, await response.text());
  }

  return await contentTypeHandler(result)(result, options);
};

export const source = (doc = nil) => doc.body;

export const addContentType = (contentType, handler) => contentTypes[contentType] = handler;

const fetch = makeFetchHappen.defaults({ cacheManager: "./http-cache" });

const contentTypes = {};
const contentTypeHandler = (doc) => {
  const contentType = doc.headers["content-type"];
  return contentType in contentTypes ? contentTypes[contentType] : async (doc) => doc;
};

const uriReference = (url) => url.split("#", 1)[0];
