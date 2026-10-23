/**
 * Browsers can't read files, so there are no symlinks to follow
 *
 * @type (url: URL) => Promise<URL>
 */
export const realUrl = async (url) => url;
