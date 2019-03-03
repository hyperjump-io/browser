const makeFetchHappen = require("make-fetch-happen");
const resolveUrl = require("url").resolve;


const construct = (url, headers, body) => Object.freeze({ url, headers, body });
const extend = (doc, extras) => Object.freeze({ ...doc, ...extras });

const nil = construct("", {}, undefined);

const get = async (url, doc = nil, options = {}) => {
  let result;
  const resolvedUrl = resolveUrl(doc.url, url);

  if (uriReference(doc.url) === uriReference(resolvedUrl)) {
    result = extend(doc, { url: resolvedUrl });
  } else if (doc.embedded && uriReference(resolvedUrl) in doc.embedded) {
    const headers = { "content-type": doc.headers["content-type"] };
    result = construct(resolvedUrl, headers, doc.embedded[resolvedUrl]);
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

const source = (doc = nil) => doc.body;

const addContentType = (contentType, handler) => contentTypes[contentType] = handler;

const fetch = makeFetchHappen.defaults({ cacheManager: "./http-cache" });

const contentTypes = {};
const contentTypeHandler = (doc) => {
  const contentType = doc.headers["content-type"];
  return contentType in contentTypes ? contentTypes[contentType] : async (doc) => doc;
};

const uriReference = (url) => url.split("#", 1)[0];

module.exports = { construct, extend, nil, get, source, addContentType };
