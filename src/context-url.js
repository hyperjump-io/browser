import { join } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";

/**
 * The working directory, as a directory's URL. It's the same type as the
 * browser's, which doesn't always have one.
 *
 * @type () => URL | undefined
 */
export const contextUrl = () => pathToFileURL(join(cwd(), "/"));

/** What's local to the application by default: the working directory */
export const defaultAllowRetrieval = ["./"];
