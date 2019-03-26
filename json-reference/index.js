const JsonPointer = require("@hyperjump/json-pointer");
const curry = require("just-curry-it");
const Hyperjump = require("..");


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

const nil = Hyperjump.nil;
const source = Hyperjump.source;

const get = curry(async (url, doc, options = {}) => {
  const defaultHeaders = { "Accept": "application/reference+json" };
  options.headers = { ...defaultHeaders, ...options.headers };
  return await Hyperjump.get(url, doc, options);
});

const value = (subject) => {
  if (isDocument(subject)) {
    const doc = subject;
    return JsonPointer.get(pointer(doc), doc.jref);
  } else {
    return subject;
  }
};

const pointer = (doc) => decodeURIComponent(uriFragment(doc.url));

const entries = (subject, options = {}) => {
  if (isDocument(subject)) {
    return Promise.all(Object.keys(value(subject))
      .map(async (key) => {
        const url = append(key, subject);
        return [key, await get(url, subject, options)];
      }));
  } else {
    return Object.entries(subject);
  }
};

const map = curry(async (fn, subject, options = {}) => {
  const list = (await entries(subject, options))
    .map(([_key, item]) => fn(item));

  return Promise.all(list);
});

const filter = curry(async (fn, subject, options = {}) => {
  return reduce(async (acc, item) => {
    return (await fn(item)) ? acc.concat(item) : acc;
  }, [], subject, options);
});

const reduce = curry(async (fn, acc, subject, options = {}) => {
  return (await entries(subject, options))
    .reduce(async (acc, [_key, item]) => fn(await acc, item), acc);
});

const pipeline = curry((fns, subject) => {
  return fns.reduce(async (acc, fn) => fn(await acc), subject);
});

const uriFragment = (url) => url.split("#", 2)[1] || "";
const uriReference = (url) => url.split("#", 1)[0];
const isObject = (value) => typeof value === "object" && !Array.isArray(value) && value !== null;
const isRef = (value) => isObject(value) && "$href" in value;
const isId = (value) => isObject(value) && "$embedded" in value;
const isDocument = (value) => isObject(value) && "url" in value;
const append = (key, doc) => {
  const ptr = JsonPointer.append(key, pointer(doc));
  return "#" + encodeURI(ptr).replace(/#/g, "%23");
};

module.exports = {
  contentType, contentTypeHandler,
  nil, source, get,
  value, pointer, entries, map, filter, reduce, pipeline
};
