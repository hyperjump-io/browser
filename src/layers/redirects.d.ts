import type { Decorator, FetchContext, Fetcher, Layer } from "../layers.d.ts";

export type RedirectsOptions = {
  /** More redirects than this is a network error. Default 20, the Fetch standard's. */
  max?: number;

  /**
   * The schemes a redirect can lead to. Default `["http:", "https:"]`, as in
   * browsers, so a server can't send a request to `file:` or `data:`.
   */
  schemes?: string[];
};

/**
 * Follows redirects one at a time, each as a new request down the stack, so
 * every layer below sees each URL. It follows the Fetch standard's rules.
 * The response has its final `url`, `redirected`, and the URLs it went
 * through as `responseMeta(response).redirects`.
 */
export class Redirects implements Layer {
  constructor(inner: Fetcher, options?: RedirectsOptions);

  readonly inner: Fetcher;

  fetch(request: Request, ctx: FetchContext): Promise<Response>;
}

export const redirects: (options?: RedirectsOptions) => Decorator<Redirects>;
