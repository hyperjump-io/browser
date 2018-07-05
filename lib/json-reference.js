import * as JsonPointer from "@hyperjump/json-pointer";


const construct = (url, content) => Object.freeze({ url, content });

export const load = (url, content) => {
  const doc = construct(url, JSON.parse(content));
  return follow(doc, url);
};

export const value = (doc) => JsonPointer.get(doc.content, pointer(doc));

export const pointer = (doc) => decodeURIComponent(doc.url.split("#", 2)[1]);

// TODO: Handle remote references
export const follow = (doc, url) => {
  // Assumes id is always ""
  const result = construct(url, doc.content);
  const resultValue = value(result);
  return resultValue["$ref"] ? follow(result, resultValue["$ref"]) : result;
};
