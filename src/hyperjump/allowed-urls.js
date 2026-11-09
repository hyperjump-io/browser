import { realUrl } from "#real-url";

/**
 * Where a session's `allowRetrieval` came from, said the way an error says
 * where to change it: `in the ${source}`, `Use the ${source}`.
 */
export const configSource = "'allowRetrieval' config";
export const sessionSource = "session's 'allowRetrieval' option";

/**
 * Resolve `allowRetrieval` entries against the context URL. One that isn't a
 * URL, or is relative where there's no context URL, such as in a worker,
 * throws, and the error says where the list came from (`source`).
 *
 * @type (allowRetrieval: string[], contextUrl: string | undefined, source: string) => string[]
 */
export const resolveAllowRetrieval = (allowRetrieval, contextUrl, source) => {
  return allowRetrieval.map((entry) => {
    let url;
    try {
      url = new URL(entry);
    } catch {
      if (contextUrl === undefined) {
        throw TypeError(`'${entry}' in the ${source} is relative, and there's nothing to resolve it against here. Use an absolute URL.`);
      }

      try {
        url = new URL(entry, contextUrl);
      } catch {
        throw TypeError(`'${entry}' in the ${source} isn't a URL`);
      }
    }

    url.hash = "";
    return url.href;
  });
};

/**
 * The default is resolved when it's first checked, not when it's
 * configured, so an application without a context URL that only uses
 * documents it doesn't retrieve doesn't need the config.
 */
const defaultAllowRetrieval = ["./"];

/**
 * What a session can retrieve. A `file:` entry is compared by its real path,
 * like the URL being checked. It's found the first time it's checked and
 * kept for the session.
 */
export class AllowedUrls {
  /** @type string[] | undefined */
  #entries;

  /** @type string | undefined */
  #contextUrl;

  /** @type Promise<string[]> | undefined */
  #realEntries;

  /**
   * @param {string[] | undefined} entries - Resolved entries. Without them, it's the default.
   * @param {string | undefined} contextUrl - What the default is resolved against
   */
  constructor(entries, contextUrl) {
    this.#entries = entries;
    this.#contextUrl = contextUrl;
  }

  /** @type (url: string) => Promise<boolean> */
  async allows(url) {
    this.#realEntries ??= Promise.all((this.#entries ?? resolveDefault(this.#contextUrl)).map(realEntry));
    const entries = await this.#realEntries;
    const { href } = await realUrl(new URL(url));
    return entries.some((entry) => entry.endsWith("/") ? href.startsWith(entry) : href === entry);
  }
}

/**
 * The default is relative, so without a context URL the application has to
 * configure a list of absolute URLs
 *
 * @type (contextUrl: string | undefined) => string[]
 */
const resolveDefault = (contextUrl) => {
  if (contextUrl === undefined) {
    throw TypeError(`The default 'allowRetrieval' is '${defaultAllowRetrieval.join("', '")}', which is relative, and there's nothing to resolve it against here. Use the ${configSource} with absolute URLs.`);
  }

  return resolveAllowRetrieval(defaultAllowRetrieval, contextUrl, configSource);
};

/**
 * A real path doesn't end with `/`, so a directory's entry gets it back
 *
 * @type (entry: string) => Promise<string>
 */
const realEntry = async (entry) => {
  const { href } = await realUrl(new URL(entry));
  return entry.endsWith("/") && !href.endsWith("/") ? `${href}/` : href;
};
