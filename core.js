const makeFetchHappen = require("make-fetch-happen");
const resolveUrl = require("url").resolve;
const curry = require("just-curry-it");


const construct = (url, headers, body) => Object.freeze({ url, headers, body });
const extend = (doc, extras) => Object.freeze({ ...doc, ...extras });

const nil = construct("", {}, undefined);

const get = curry(async (url, doc, options = {}) => {
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

  return await contentTypeHandler(result).get(result, options);
});

const fetch = makeFetchHappen.defaults({ cacheManager: "./http-cache" });

const source = (doc) => doc.body;
const value = (doc) => isDocument(doc) ? contentTypeHandler(doc).value(doc) : doc;
const entries = (doc, options = {}) => {
  if (isDocument(doc)) {
    return contentTypeHandler(doc).entries(doc, options);
  } else {
    return Object.entries(doc);
  }
};

const map = curry(async (fn, subject, options = {}) => {
  const list = (await entries(subject, options))
    .map(([_key, item]) => fn(item));

  return Promise.all(list);
});

const filter = curry(async (fn, subject, options = {}) => {
  return reduce(async (acc, item) => {
    return (await fn(item)) ? acc.concat([item]) : acc;
  }, [], subject, options);
});

const reduce = curry(async (fn, acc, subject, options = {}) => {
  return (await entries(subject, options))
    .reduce(async (acc, [_key, item]) => fn(await acc, item), acc);
});

const pipeline = curry((fns, subject) => {
  return fns.reduce(async (acc, fn) => fn(await acc), subject);
});

const addContentType = (contentType, handler) => contentTypes[contentType] = handler;

const contentTypes = {};

const defaultHandler = {
  get: async (doc) => doc,
  value: source,
  entries: async (doc) => Object.entries(value(doc))
};

const contentTypeHandler = (doc) => {
  const contentType = doc.headers["content-type"];
  return contentType in contentTypes ? contentTypes[contentType] : defaultHandler;
};

const uriReference = (url) => url.split("#", 1)[0];
const isObject = (value) => typeof value === "object" && !Array.isArray(value) && value !== null;
const isDocument = (value) => isObject(value) && "url" in value;

module.exports = {
  construct, extend, addContentType,
  nil, get, source, value, entries, map, filter, reduce, pipeline
};
