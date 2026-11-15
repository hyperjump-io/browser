// What jsonValue's and jrefValue's types say a node's value is. It's only
// type-checked.
import { fromJs, get, Hyperjump, jrefValue, jsonValue } from "../index.js";
import type { Json, JsonPropertyNameNode } from "../index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const yes = <T extends true>(_is?: T) => {};

const node = fromJs(1, "https://example.com/a");

// A node that could be anything has any JSON value
yes<Equal<ReturnType<typeof jsonValue<typeof node>>, null | boolean | number | string | Json[] | Record<string, Json>>>();
yes<Equal<Json, null | boolean | number | string | Json[] | Record<string, Json>>>();

// A node narrowed to one type, or to several, has a value of theirs
if (node.jsonType === "number") {
  yes<Equal<ReturnType<typeof jsonValue<typeof node>>, number>>();
}
if (node.jsonType === "array") {
  yes<Equal<ReturnType<typeof jsonValue<typeof node>>, Json[]>>();
}
if (node.jsonType === "string" || node.jsonType === "boolean") {
  const value = jsonValue(node);
  yes<Equal<typeof value, string | boolean>>();
}
if (node.jsonType !== "object") {
  const value = jsonValue(node);
  yes<Equal<typeof value, null | boolean | number | string | Json[]>>();
}

// A property's name is a string
declare const name: JsonPropertyNameNode;
const nameValue = jsonValue(name);
yes<Equal<typeof nameValue, string>>();

// jrefValue is the same for the values it takes, and an object or an array
// is the scalars, because it throws for them
const session = new Hyperjump({ allowRetrieval: [] });
const followed = await get(session, "https://example.com/");
if (followed.jsonType === "null") {
  const value = jrefValue(followed);
  yes<Equal<typeof value, null>>();
}
if (followed.jsonType === "string" || followed.jsonType === "number") {
  const value = jrefValue(followed);
  yes<Equal<typeof value, string | number>>();
}
const anyValue = jrefValue(followed);
yes<Equal<typeof anyValue, string | number | boolean | null>>();
