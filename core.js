const curry = require("just-curry-it");
const contentTypeParser = require("content-type");
const resolveUrl = require("url-resolve-browser");
const http = require("./fetch");
const { uriReference, isObject } = require("./common");


const construct = (url, headers, body) => Object.freeze({ url, headers, body });
const extend = (doc, extras) => Object.freeze({ ...doc, ...extras });

const nil = construct("", {}, undefined);
const source = (doc) => doc.body;
const value = (doc) => contentTypeHandler(doc).value(doc);

const fetch = curry((url, options = {}) => {
  const resultDoc = get(url, nil, options);
  return wrapper(resultDoc, options);
});

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
    const response = await http(resolvedUrl, options);
    const headers = {};
    for (const [name, value] of response.headers.entries()) {
      headers[name] = value;
    }
    result = construct(resolvedUrl, headers, await response.text());
  }

  return await contentTypeHandler(result).get(result, options);
});

const wrapper = (doc, options = {}) => {
  return new Proxy(doc, {
    get: (doc, propertyName) => {
      if (propertyName === "then") {
        const v = project(doc, options);
        const then = v.then;
        return then.bind(v);
      } else if (propertyName === "$follow") {
        return (url) => {
          const nextDoc = get(url, doc, options);
          return wrapper(nextDoc, options);
        };
      } else if (propertyName === "$source") {
        return doc.then(value);
      } else if (propertyName === "$url") {
        return doc.then((d) => d.url);
      } else {
        const value = safeStep(propertyName, doc, options);
        return wrapper(value, options);
      }
    }
  });
};

const project = async (doc, options = {}) => {
  const docValue = value(await doc);

  if (isObject(docValue)) {
    return Object.keys(docValue).reduce((acc, key) => {
      const resultDoc = step(key, doc, options);
      acc[key] = wrapper(resultDoc, options);
      return acc;
    }, {});
  } else if (Array.isArray(docValue)) {
    return Object.keys(docValue).map((key) => {
      const resultDoc = step(key, doc, options);
      return wrapper(resultDoc, options);
    });
  } else {
    return docValue;
  }
};

const step = curry(async (key, doc, options = {}) => {
  return contentTypeHandler(await doc).step(key, await doc, options);
});

const safeStep = async (propertyName, doc, options = {}) => {
  const docValue = value(await doc);
  const keys = Object.keys(docValue);
  return keys.includes(propertyName) ? step(propertyName, doc, options) : undefined;
};

const contentTypes = {};

const defaultHandler = {
  get: async (doc) => doc,
  value: (doc) => isDocument(doc) ? source(doc) : doc,
  step: async (key, doc) => value(doc)[key]
};

const addContentType = (contentType, handler) => contentTypes[contentType] = handler;
const getContentType = (contentType) => contentTypes[contentType];

const contentTypeHandler = (doc) => {
  if (doc === nil || !isDocument(doc)) {
    return defaultHandler;
  }

  const contentType = contentTypeParser.parse(doc.headers["content-type"]).type;
  return contentType in contentTypes ? contentTypes[contentType] : defaultHandler;
};

const isDocument = (value) => isObject(value) && "url" in value;

module.exports = {
  construct, extend, addContentType, getContentType,
  nil, get, fetch, source, value, step
};
