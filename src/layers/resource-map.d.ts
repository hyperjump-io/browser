import type { Decorator, FetchContext, Fetcher, Layer } from "../layers.d.ts";
import type { Session } from "../session.d.ts";
import type { RegistryEntry } from "./registry.d.ts";

export type ResourceMapOptions = {
  /**
   * Whether a session sees what's registered in its parents. Default `true`:
   * a child session, like a frame, sees what its page found, but not the
   * other way around.
   */
  inherit?: boolean;
};

export type RegisterOptions = {
  /** A parsed form of the resource, which responses have as `responseMeta(response).value` */
  value?: unknown;
};

export type FoundResource = {
  url: string;
  entry: RegistryEntry;
  value: unknown;

  /** The session it was registered in: the one that asked, or one of its parents */
  session: Session;
};

/**
 * Resources found while loading, for one session. When a document turns out
 * to contain others with URLs of their own, whatever parses it registers
 * them, and the session's requests for those URLs are answered from the
 * map instead of fetched.
 */
export class ResourceMap implements Layer {
  constructor(inner: Fetcher, options?: ResourceMapOptions);

  readonly inner: Fetcher;

  /**
   * Register a resource in a session. Returns `false` if the same resource is
   * already there.
   *
   * @throws An `Error` if the session has different content for the URL. A
   * child can register a URL its parent has.
   */
  register(session: Session, url: string | URL, entry: RegistryEntry, options?: RegisterOptions): boolean;

  /** A registered resource, looked for in the session and, with `inherit`, its parents */
  lookup(session: Session, url: string | URL): FoundResource | undefined;

  /** The URLs registered in a session, not its parents */
  urls(session: Session): IterableIterator<string>;

  fetch(request: Request, ctx: FetchContext): Promise<Response>;
}

export const resourceMap: (options?: ResourceMapOptions) => Decorator<ResourceMap>;
