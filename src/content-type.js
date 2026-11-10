/**
 * @import * as API from "./content-type.d.ts"
 */

/** @type Readonly<Record<string, string>> */
const contentTypes = Object.freeze({
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  map: "application/json",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  xml: "application/xml",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  wasm: "application/wasm",
  woff: "font/woff",
  woff2: "font/woff2",
  pdf: "application/pdf"
});

/** @type typeof API.contentTypeByExtension */
export const contentTypeByExtension = (pathOrUrl, overrides = {}) => {
  const name = pathOrUrl.split(/[?#]/)[0];
  const dot = name.lastIndexOf(".");
  if (dot === -1 || dot < name.lastIndexOf("/")) {
    return undefined;
  }
  const extension = name.slice(dot + 1).toLowerCase();
  return Object.hasOwn(overrides, extension) ? overrides[extension] : Object.hasOwn(contentTypes, extension) ? contentTypes[extension] : undefined;
};
