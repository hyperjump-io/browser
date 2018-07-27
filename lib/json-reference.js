import axios from "axios";
import "babel-polyfill";
import Promise from "bluebird";
import { resolve as resolveUrl } from "url";
import * as JsonPointer from "@hyperjump/json-pointer";


const construct = (url, content) => Object.freeze({ url, content });

export const nil = construct("", undefined);

export const value = (doc) => JsonPointer.get(doc.content, pointer(doc));

export const pointer = (doc) => decodeURIComponent(doc.url.split("#", 2)[1] || "");

export const get = async (url, doc = nil) => {
  const resolvedUrl = resolveUrl(doc.url, url);
  const response = await axios.get(resolvedUrl);

  const result = construct(resolvedUrl, response.data);
  const resultValue = value(result);

  return isRef(resultValue) ? get(resultValue["$ref"], result) : result;
};

const isObject = (value) => typeof value === "object" && !Array.isArray(value) && value !== null;
const isRef = (value) => isObject(value) && "$ref" in value;

const append = (doc, key) => {
  const ptr = pointer(doc);
  return "#" + encodeURI(JsonPointer.append(ptr, key));
};

export const entries = async (doc) => {
  const items = Object.keys(value(doc))
    .map(async (key) => {
      const url = append(doc, key);
      return [key, await get(url, doc)];
    });

  return await Promise.all(items);
};

export const map = (fn, doc) => {
  const items = Object.keys(value(doc))
    .map((key) => {
      const url = append(doc, key);
      return get(url, doc);
    });

  return Promise.map(items, fn);
};
