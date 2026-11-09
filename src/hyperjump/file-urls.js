import { contextUrl } from "#context-url";

/**
 * @import * as API from "./file-urls.d.ts"
 */

/** @type typeof API.relativeFileUrl */
export const relativeFileUrl = (url) => {
  if (!url.startsWith("file:")) {
    return url;
  }

  const target = new URL(url);

  // There are no files to be relative to where the working directory isn't
  // a folder, like in a browser
  const base = contextUrl();
  if (base === undefined || !base.startsWith("file:")) {
    return target.pathname.slice(target.pathname.lastIndexOf("/") + 1) + target.search + target.hash;
  }

  const from = new URL(base);
  if (target.host !== from.host) {
    return url;
  }

  // The base is a folder, so its last segment is the empty one after its `/`
  const baseSegments = from.pathname.split("/").slice(0, -1);
  const targetSegments = target.pathname.split("/");
  let common = 0;
  while (common < baseSegments.length && common < targetSegments.length - 1 && baseSegments[common] === targetSegments[common]) {
    common++;
  }

  const path = "../".repeat(baseSegments.length - common) + targetSegments.slice(common).join("/");
  return (path || "./") + target.search + target.hash;
};
