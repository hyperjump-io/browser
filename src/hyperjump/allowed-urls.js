import { realUrl } from "#real-url";

/**
 * Where a session's `allowRetrieval` came from, said the way an error says
 * where to change it: `in the ${source}`, `Use the ${source}`.
 */
export const configSource = "'allowRetrieval' config";
export const sessionSource = "session's 'allowRetrieval' option";

/**
 * Resolve `allowRetrieval` entries against the context URI. One that isn't a
 * URL, or is relative where there's no context URI (`""`), such as in a
 * worker, throws, and the error says where the list came from (`source`).
 *
 * @type (allowRetrieval: string[], contextUri: string, source: string) => string[]
 */
export const resolveAllowRetrieval = (allowRetrieval, contextUri, source) => {
  return allowRetrieval.map((entry) => {
    let url;
    try {
      url = new URL(entry);
    } catch {
      if (contextUri === "") {
        throw Error(`'${entry}' in the ${source} is relative, and there's nothing to resolve it against here. Use an absolute URL.`);
      }

      try {
        url = new URL(entry, contextUri);
      } catch {
        throw Error(`'${entry}' in the ${source} isn't a URL`);
      }
    }

    url.hash = "";
    return url.href;
  });
};

/**
 * The default is resolved when it's first checked, not when it's
 * configured, so an application without a context URI that only uses
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

  /** @type string */
  #contextUri;

  /** @type Promise<string[]> | undefined */
  #realEntries;

  /**
   * @param {string[] | undefined} entries - Resolved entries. Without them, it's the default.
   * @param {string} contextUri - What the default is resolved against
   */
  constructor(entries, contextUri) {
    this.#entries = entries;
    this.#contextUri = contextUri;
  }

  /** @type (uri: string) => Promise<boolean> */
  async allows(uri) {
    this.#realEntries ??= Promise.all((this.#entries ?? resolveDefault(this.#contextUri)).map(realEntry));
    const entries = await this.#realEntries;
    const { href } = await realUrl(new URL(uri));
    return entries.some((entry) => entry.endsWith("/") ? href.startsWith(entry) : href === entry);
  }
}

/**
 * The default is relative, so without a context URI the application has to
 * configure a list of absolute URLs
 *
 * @type (contextUri: string) => string[]
 */
const resolveDefault = (contextUri) => {
  if (contextUri === "") {
    throw Error(`The default 'allowRetrieval' is '${defaultAllowRetrieval.join("', '")}', which is relative, and there's nothing to resolve it against here. Use the ${configSource} with absolute URLs.`);
  }

  return resolveAllowRetrieval(defaultAllowRetrieval, contextUri, configSource);
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
