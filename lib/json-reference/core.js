const JsonPointer = require("@hyperjump/json-pointer");
const Hyperjump = require("../core");
const { uriReference, uriFragment, isObject } = require("../common");


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

const step = async (key, doc, options = {}) => {
  const ptr = JsonPointer.append(key, pointer(await doc));
  const url = "#" + encodeURI(ptr).replace(/#/g, "%23");
  return Hyperjump.get(url, doc, options);
};

const pointer = (doc) => decodeURIComponent(uriFragment(doc.url));
const isHref = (value) => isObject(value) && "$href" in value;
const isEmbedded = (value) => isObject(value) && "$embedded" in value;

module.exports = { get, value, step };
