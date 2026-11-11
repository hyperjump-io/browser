import type { Decorator, FetchContext, Fetcher, Layer } from "../layers.d.ts";
import type { FetchRecord } from "../fetch-record.d.ts";
import type { RegistryEntry } from "./registry.d.ts";

export type RegisterOptions = {
  /** A parsed form of the resource, which responses have as `responseMeta(response).value` */
  value?: unknown;
};

export type FoundResource = {
  url: string;
  entry: RegistryEntry;
  value: unknown;
};

/**
 * Resources found in documents, like the resources in a web bundle. When a
 * document turns out to contain others with URLs of their own, whatever
 * parses it registers them in the document, and requests the document causes
 * for those URLs are answered from the map instead of fetched. A request
 * caused by anything else is fetched as usual, so a document can't change
 * what another one gets.
 */
export class ResourceMap implements Layer {
  constructor(inner: Fetcher);

  readonly inner: Fetcher;

  /**
   * Register a resource in the document that contains it: a response from a
   * session, or its record. A resource registered in a response from the map
   * is in the same set as the others its document contains. Returns `false`
   * if the same resource is already there.
   *
   * @throws A `TypeError` if `container` is a response that isn't from a
   * session.
   * @throws An `Error` if the document has different content for the URL.
   */
  register(container: Response | FetchRecord, url: string | URL, entry: RegistryEntry, options?: RegisterOptions): boolean;

  /**
   * The resource a request for `url` caused by `initiator` is answered with:
   * one registered in the initiator, or in the document the initiator was
   * found in
   */
  lookup(initiator: Response | FetchRecord, url: string | URL): FoundResource | undefined;

  /** The URLs registered in a document, and in the others found with it */
  urls(container: Response | FetchRecord): IterableIterator<string>;

  fetch(request: Request, ctx: FetchContext): Promise<Response>;
}

export const resourceMap: () => Decorator<ResourceMap>;
