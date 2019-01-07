const JsonPointer = require("@hyperjump/json-pointer");
const Promise = require("bluebird");
const Hyperjump = require("..");
const Json = require("../json");


const contentType = "application/reference+json";
const contentTypeHandler = async (doc, options) => {
  let jsonDoc = await Json.contentTypeHandler(doc, options);
  let docValue = value(jsonDoc);

  if (isId(docValue)) {
    const id = docValue["$id"];
    delete docValue["$id"];
    // TODO: Cache embedded document. I'll probably need to implement my own HTTP Cache for this.
    const headers = { "content-type": jsonDoc.headers["content-type"] };
    jsonDoc = Hyperjump.construct(id, headers, JSON.stringify(docValue));
    docValue = value(jsonDoc);
  }

  return isRef(docValue) ? await get(docValue["$ref"], jsonDoc, options) : jsonDoc;
};

Hyperjump.addContentType(contentType, contentTypeHandler);

const nil = Json.nil;
const source = Json.source;

const get = async (url, doc = nil, options = {}) => {
  const defaultHeaders = { "Accept": "application/reference+json" };
  options.headers = { ...defaultHeaders, ...options.headers };
  return await Hyperjump.get(url, doc, options);
};

const value = (doc) => JsonPointer.get(pointer(doc))(Json.value(doc));

const pointer = (doc) => decodeURIComponent(uriFragment(doc.url));

const entries = (doc, options = {}) => {
  const items = Object.keys(value(doc))
    .map(async (key) => {
      const url = append(doc, key);
      return [key, await get(url, doc, options)];
    });

  return Promise.all(items);
};

const map = (fn, doc, options = {}) => {
  const items = Object.keys(value(doc))
    .map((key) => {
      const url = append(doc, key);
      return get(url, doc, options);
    });

  return Promise.map(items, fn);
};

const uriFragment = (url) => url.split("#", 2)[1] || "";
const isObject = (value) => typeof value === "object" && !Array.isArray(value) && value !== null;
const isRef = (value) => isObject(value) && "$ref" in value;
const isId = (value) => isObject(value) && "$id" in value;
const append = (doc, key) => "#" + encodeURI(JsonPointer.append(pointer(doc), key));

module.exports = { contentType, contentTypeHandler, get, nil, source, value, pointer, entries, map };
