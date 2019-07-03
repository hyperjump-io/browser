const curry = require("just-curry-it");
const resolveUrl = require("url-resolve-browser");
const fetch = require("./fetch");
const { uriReference, isObject } = require("./common");


const construct = (url, headers, body) => Object.freeze({ url, headers, body });
const extend = (doc, extras) => Object.freeze({ ...doc, ...extras });

const nil = construct("", {}, undefined);
const source = (doc) => doc.body;
const value = (doc) => isDocument(doc) ? contentTypeHandler(doc).value(doc) : doc;

const get = curry(async (url, contextDoc, options = {}) => {
  let result;
  const doc = await contextDoc;
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

const step = curry(async (key, doc, options = {}) => isDocument(await doc) ? (
  contentTypeHandler(await doc).step(key, await doc, options)
) : (
  (await doc)[key]
));

const entries = async (doc, options = {}) => isDocument(await doc) ? (
  Promise.all(Object.keys(value(await doc))
    .map(async (key) => [key, await step(key, await doc, options)]))
) : (
  Object.entries(await doc)
);

const map = curry(async (fn, doc, options = {}) => {
  const list = (await entries(doc, options))
    .map(([key, item]) => fn(item, key));

  return Promise.all(list);
});

const filter = curry(async (fn, doc, options = {}) => {
  return reduce(async (acc, item) => {
    return (await fn(item)) ? acc.concat([item]) : acc;
  }, [], doc, options);
});

const some = curry(async (fn, doc, options = {}) => {
  return (await map(fn, doc, options))
    .some((a) => a);
});

const every = curry(async (fn, doc, options = {}) => {
  return (await map(fn, doc, options))
    .every((a) => a);
});

const reduce = curry(async (fn, acc, doc, options = {}) => {
  return (await entries(doc, options))
    .reduce(async (acc, [_key, item]) => fn(await acc, item), acc);
});

const pipeline = curry((fns, doc) => {
  return fns.reduce(async (acc, fn) => fn(await acc), doc);
});

const addContentType = (contentType, handler) => contentTypes[contentType] = handler;

const contentTypes = {};

const defaultHandler = {
  get: async (doc) => doc,
  value: source,
  step: async (key, doc) => value(doc)[key]
};

const contentTypeHandler = (doc) => {
  const contentType = doc.headers["content-type"];
  return contentType in contentTypes ? contentTypes[contentType] : defaultHandler;
};

const isDocument = (value) => isObject(value) && "url" in value;

module.exports = {
  construct, extend, addContentType,
  nil, get, source, value, entries, step, map, filter, reduce, some, every, pipeline
};
