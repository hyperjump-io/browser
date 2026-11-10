/**
 * @import * as API from "./cache-control.d.ts"
 */

/** @type typeof API.parseCacheControl */
export const parseCacheControl = (value) => {
  /** @type Map<string, string> */
  const directives = new Map();
  for (const part of value?.split(",") ?? []) {
    const [rawName, ...rest] = part.split("=");
    const name = rawName.trim().toLowerCase();
    if (name && !directives.has(name)) {
      const argument = rest.join("=").trim();
      directives.set(name, argument.replace(/^"(.*)"$/, "$1"));
    }
  }
  return directives;
};

/** @type typeof API.varyMatches */
export const varyMatches = (entry, requestHeaders) => {
  const vary = entry.headers.find(([name]) => name.toLowerCase() === "vary")?.[1];
  if (!vary) {
    return true;
  }
  const stored = new Headers(entry.requestHeaders);
  return vary.split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .every((name) => name !== "*" && stored.get(name) === requestHeaders.get(name));
};
