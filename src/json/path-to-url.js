import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * A file's URL
 *
 * @type (cwd: string, path: string) => string
 */
export const pathToUrl = (cwd, path) => pathToFileURL(resolve(cwd, path)).href;
