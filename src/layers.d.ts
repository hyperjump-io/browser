import type { CacheMode, Session } from "./session.d.ts";
import type { PrioritySignal } from "./priority.d.ts";
import type { FetchRecord } from "./fetch-record.d.ts";

/**
 * Anything that can answer a request: a transport, a layer, or a whole
 * stack. A stack is a fetcher, so it can be wrapped again.
 */
export interface Fetcher {
  fetch(request: Request, ctx: FetchContext): Promise<Response>;
}

/** A fetcher that wraps another. `inner` is what it wraps, so a stack can be walked. */
export interface Layer extends Fetcher {
  readonly inner: Fetcher;
}

/** Builds a layer around a fetcher. {@link compose} chains them. */
export type Decorator<Out extends Fetcher = Fetcher> = (inner: Fetcher) => Out;

/**
 * What the session knows about a request, which goes down the stack with
 * it. A layer can give the one below it a changed copy, like
 * `{ ...ctx, signal }`, but these are the only fields.
 */
export type FetchContext = {
  readonly session: Session;

  /** How the HTTP cache handles the request, from `fetch(url, { cache })` */
  readonly cacheMode: CacheMode;

  /** Aborts when the caller aborts, or the session or one of its parents closes */
  readonly signal: AbortSignal;

  /**
   * The request's priority, from `fetch(url, { priority })`. Read `value`, and
   * listen for `"change"` to follow it while a request waits.
   */
  readonly priority: PrioritySignal;

  /**
   * What the resource is for, from `fetch(url, { destination })`, like
   * `"document"`, `"style"`, or `"image"`. It's `""` if it isn't given, as for
   * `fetch` in a browser.
   */
  readonly destination: string;

  /** The request's record. A layer says what it did with `record.mark(name, detail)`. */
  readonly record: FetchRecord;
};

/**
 * Chain decorators, the first one outermost, so they read the way the stack
 * does from the top: `compose(a(), b())(transport)` is `a()(b()(transport))`.
 */
export const compose: (...decorators: Decorator[]) => (inner: Fetcher) => Fetcher;

/** A fetcher from a function, for a transport or a test */
export const fetcher: (fn: (request: Request, ctx: FetchContext) => Promise<Response> | Response) => Fetcher;

/** A layer from a function, for one that doesn't need a class, like one that adds a header */
export const layer: (fn: (request: Request, ctx: FetchContext, inner: Fetcher) => Promise<Response>) => Decorator<Layer>;

/** The fetchers in a stack, from the top down, through each layer's `inner` */
export const layersOf: (stack: Fetcher) => Generator<Fetcher, void, unknown>;

/** The first layer of a class in a stack, like `findLayer(stack, HttpCache)` */
export const findLayer: <T extends Fetcher>(stack: Fetcher, type: abstract new (...args: any[]) => T) => T | undefined;
