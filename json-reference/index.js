const JsonPointer = require("@hyperjump/json-pointer");
const curry = require("just-curry-it");
const Promise = require("bluebird");
const Hyperjump = require("..");
const Json = require("../json");


const contentType = "application/reference+json";
const contentTypeHandler = async (doc, options) => {
  const jrefDoc = (!("jref" in doc)) ? Hyperjump.extend(doc, parse(doc)) : doc;
  const docValue = value(jrefDoc);
  return isRef(docValue) ? await get(docValue["$href"], jrefDoc, options) : jrefDoc;
};

const parse = (doc) => {
  const embedded = {};
  const jref = JSON.parse(Hyperjump.source(doc), (key, value) => {
    if (isId(value)) {
      const id = uriReference(value["$embedded"]);
      delete value["$embedded"];
      embedded[id] = JSON.stringify(value);
      return { "$href": id };
    } else {
      return value;
    }
  });

  return { jref, embedded };
};

Hyperjump.addContentType(contentType, contentTypeHandler);

const nil = Json.nil;
const source = Json.source;

const get = curry(async (url, doc, options = {}) => {
  const defaultHeaders = { "Accept": "application/reference+json" };
  options.headers = { ...defaultHeaders, ...options.headers };
  return await Hyperjump.get(url, doc, options);
});

const value = (doc) => JsonPointer.get(pointer(doc), doc.jref);

const pointer = (doc) => decodeURIComponent(uriFragment(doc.url));

const entries = (doc, options = {}) => {
  const items = Object.keys(value(doc))
    .map(async (key) => {
      const url = append(key, doc);
      return [key, await get(url, doc, options)];
    });

  return Promise.all(items);
};

const map = curry((fn, doc, options = {}) => {
  const items = Object.keys(value(doc))
    .map((key) => {
      const url = append(key, doc);
      return get(url, doc, options);
    });

  return Promise.map(items, fn);
});

const pipeline = (fns) => {
  const [handler = identity, ...handlers] = fns;
  return (...args) => Promise.resolve(handler(...args))
    .then(data => Promise.reduce(handlers, (acc, fn) => fn(acc), data));
};

const uriFragment = (url) => url.split("#", 2)[1] || "";
const uriReference = (url) => url.split("#", 1)[0];
const isObject = (value) => typeof value === "object" && !Array.isArray(value) && value !== null;
const isRef = (value) => isObject(value) && "$href" in value;
const isId = (value) => isObject(value) && "$embedded" in value;
const append = (key, doc) => "#" + encodeURI(JsonPointer.append(key, pointer(doc))).replace(/#/g, "%23");
const identity = (a) => a;

module.exports = {
  contentType, contentTypeHandler,
  nil, source, get,
  value, pointer, entries, map, pipeline
};
