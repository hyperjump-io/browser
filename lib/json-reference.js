import * as JsonPointer from "@hyperjump/json-pointer";
import "babel-polyfill";
import Promise from "bluebird";
import * as Core from "~/core";


Core.addContentType("application/reference+json", async (doc = Core.nil, options = {}) => {
  let docValue = value(doc);

  if (isId(docValue)) {
    const id = docValue["$id"];
    delete docValue["$id"];
    // TODO: Cache embedded document. I'll probably need to implement my own HTTP Cache for this.
    const headers = { "content-type": doc.headers["content-type"] };
    doc = Core.construct(id, headers, JSON.stringify(docValue));
    docValue = value(doc);
  }

  return isRef(docValue) ? await get(docValue["$ref"], doc, options) : doc;
});

export const get = async (url, doc = Core.nil, options = {}) => {
  const defaultHeaders = { "Accept": "application/reference+json" };
  options.headers = { ...defaultHeaders, ...options.headers };
  return Core.get(url, doc, options);
};

export const nil = Core.nil;

export const source = Core.source;

export const value = (doc) => JsonPointer.get(pointer(doc))(JSON.parse(doc.body));

export const pointer = (doc) => decodeURIComponent(uriFragment(doc.url));

export const entries = async (doc) => {
  const items = Object.keys(value(doc))
    .map(async (key) => {
      const url = append(doc, key);
      return [key, await get(url, doc)];
    });

  return await Promise.all(items);
};

export const map = async (fn, doc) => {
  const items = Object.keys(value(doc))
    .map((key) => {
      const url = append(doc, key);
      return get(url, doc);
    });

  return await Promise.map(items, fn);
};

const uriFragment = (url) => url.split("#", 2)[1] || "";
const isObject = (value) => typeof value === "object" && !Array.isArray(value) && value !== null;
const isRef = (value) => isObject(value) && "$ref" in value;
const isId = (value) => isObject(value) && "$id" in value;
const append = (doc, key) => "#" + encodeURI(JsonPointer.append(pointer(doc), key));
