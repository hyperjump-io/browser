import { join } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";

/**
 * The working directory, as a folder. It's the same type as the browser's,
 * which doesn't always have one.
 *
 * @type () => string | undefined
 */
export const contextUrl = () => pathToFileURL(join(cwd(), "/")).href;
