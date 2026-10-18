// The parts of `http-cache-semantics` that are used. The package is typed with
// JSDoc that TypeScript doesn't read from node_modules, and
// `@types/http-cache-semantics` is behind the package.
declare module "http-cache-semantics" {
  type HttpRequest = {
    headers: Record<string, string>;
    method?: string;
    url?: string;
  };

  type HttpResponse = {
    headers: Record<string, string>;
    status?: number;
  };

  type CachePolicyOptions = {
    shared?: boolean;
    cacheHeuristic?: number;
    immutableMinTimeToLive?: number;
    ignoreCargoCult?: boolean;
  };

  export default class CachePolicy {
    constructor(request: HttpRequest, response: HttpResponse, options?: CachePolicyOptions);

    static fromObject(object: object): CachePolicy;
    toObject(): object;

    storable(): boolean;
    satisfiesWithoutRevalidation(request: HttpRequest): boolean;
    revalidationHeaders(request: HttpRequest): Record<string, string>;
    revalidatedPolicy(request: HttpRequest, response: HttpResponse): { policy: CachePolicy; modified: boolean; matches: boolean };
    responseHeaders(): Record<string, string>;
    status(): number;
    timeToLive(): number;
  }
}
