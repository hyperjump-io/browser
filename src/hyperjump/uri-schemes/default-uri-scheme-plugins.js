import { HttpUriSchemePlugin } from "./http-scheme-plugin.js";
import { FileUriSchemePlugin } from "./file-scheme-plugin.js";
import { MemoryHttpCacheStore } from "./memory-http-cache-store.js";

/**
 * @import { UriSchemePlugin } from "./uri-scheme-plugin.d.ts"
 */

/** @type () => UriSchemePlugin[] */
export const defaultUriSchemePlugins = () => [
  new HttpUriSchemePlugin({ cache: new MemoryHttpCacheStore() }),
  new FileUriSchemePlugin()
];
