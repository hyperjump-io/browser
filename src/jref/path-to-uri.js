import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** @type (cwd: string, path: string) => string */
export const pathToUri = (cwd, path) => pathToFileURL(resolve(cwd, path)).toString();
