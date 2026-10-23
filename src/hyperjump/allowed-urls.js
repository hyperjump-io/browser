import { contextUri } from "#context-uri";
import { realUrl } from "#real-url";

/**
 * Resolve `allowRetrieval` entries against the context URI. One that isn't a
 * URL, or is relative where there's no context URI, such as in a worker,
 * throws.
 *
 * @type (allowRetrieval: unknown) => string[]
 */
export const resolveAllowRetrieval = (allowRetrieval) => {
  if (!Array.isArray(allowRetrieval) || allowRetrieval.some((entry) => typeof entry !== "string")) {
    throw TypeError("The 'allowRetrieval' config must be a list of URLs");
  }

  return allowRetrieval.map((/** @type string */ entry) => {
    let url;
    try {
      url = new URL(entry);
    } catch {
      const base = contextUri();
      if (base === "") {
        throw Error(`'${entry}' in the 'allowRetrieval' config is relative, and there's nothing to resolve it against here. Use an absolute URL.`);
      }

      try {
        url = new URL(entry, base);
      } catch {
        throw Error(`'${entry}' in the 'allowRetrieval' config isn't a URL`);
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

  /** @type Promise<string[]> | undefined */
  #realEntries;

  /**
   * @param {string[]} [entries] - Resolved entries. Without them, it's the default.
   */
  constructor(entries) {
    this.#entries = entries;
  }

  /** @type (uri: string) => Promise<boolean> */
  async allows(uri) {
    this.#realEntries ??= Promise.all((this.#entries ?? resolveAllowRetrieval(defaultAllowRetrieval)).map(realEntry));
    const entries = await this.#realEntries;
    const { href } = await realUrl(new URL(uri));
    return entries.some((entry) => entry.endsWith("/") ? href.startsWith(entry) : href === entry);
  }
}

/**
 * A real path doesn't end with `/`, so a directory's entry gets it back
 *
 * @type (entry: string) => Promise<string>
 */
const realEntry = async (entry) => {
  const { href } = await realUrl(new URL(entry));
  return entry.endsWith("/") && !href.endsWith("/") ? `${href}/` : href;
};
