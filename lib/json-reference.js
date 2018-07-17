import * as JsonPointer from "@hyperjump/json-pointer";
import axios from "axios";
import "babel-polyfill";
import { resolve as resolveUrl } from "url";


const construct = (url, content) => Object.freeze({ url, content });

export const nil = construct("", "");

export const value = (doc) => JsonPointer.get(doc.content, pointer(doc));

export const pointer = (doc) => decodeURIComponent(doc.url.split("#", 2)[1] || "");

export const get = async (url, doc = nil) => {
  const resolvedUrl = resolveUrl(doc.url, url);
  const response = await axios.get(resolvedUrl);

  const result = construct(resolvedUrl, response.data);
  const resultValue = value(result);

  return isRef(resultValue) ? get(resultValue["$ref"], result) : result;
};

const isRef = (value) => typeof value === "object" && "$ref" in value;
