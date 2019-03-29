const JsonPointer = require("@hyperjump/json-pointer");
const Hyperjump = require("../core");


const get = async (doc, options) => {
  const jrefDoc = !("jref" in doc) ? Hyperjump.extend(doc, parse(doc)) : doc;
  const docValue = value(jrefDoc);
  return isHref(docValue) ? await Hyperjump.get(docValue["$href"], jrefDoc, options) : jrefDoc;
};

const parse = (doc) => {
  const embedded = {};
  const jref = JSON.parse(Hyperjump.source(doc), (key, value) => {
    if (isEmbedded(value)) {
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

const value = (doc) => JsonPointer.get(pointer(doc), doc.jref);

const entries = (doc, options = {}) => {
  return Promise.all(Object.keys(value(doc))
    .map(async (key) => {
      const url = append(key, doc);
      return [key, await Hyperjump.get(url, doc, options)];
    }));
};

const pointer = (doc) => decodeURIComponent(uriFragment(doc.url));

const uriFragment = (url) => url.split("#", 2)[1] || "";
const uriReference = (url) => url.split("#", 1)[0];
const isObject = (value) => typeof value === "object" && !Array.isArray(value) && value !== null;
const isHref = (value) => isObject(value) && "$href" in value;
const isEmbedded = (value) => isObject(value) && "$embedded" in value;
const append = (key, doc) => {
  const ptr = JsonPointer.append(key, pointer(doc));
  return "#" + encodeURI(ptr).replace(/#/g, "%23");
};

module.exports = { get, value, entries };
