import { networkError, setResponseMeta, withUrl } from "./response-meta.js";
import { refusedResponse } from "./allowed-urls.js";
import { canRefer, referrerOf, refusedReferenceResponse } from "./file-references.js";

/**
 * @import { FetchContext, Fetcher } from "./layers.d.ts"
 */

/**
 * What the session decides for each URL it fetches: how many redirects it
 * follows, the schemes they can lead to, whether it can fetch a URL, and the
 * headers each URL gets
 *
 * @typedef {{
 *   max: number,
 *   schemes: string[],
 *   allows: (url: string) => Promise<boolean>,
 *   headers: (url: string) => Promise<Headers>
 * }} FollowPolicy
 */

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/** Headers about a request's body, which go when a redirect makes it a GET */
const bodyHeaders = ["content-encoding", "content-language", "content-location", "content-type", "content-length"];

/**
 * Follow redirects one at a time, each as a new request down the stack, so
 * every layer sees each URL. Each step gets the session's headers for its own
 * URL, not the ones the step before it got. The first step's are given, so
 * the session can record them, and the session has checked that it can fetch
 * the first URL. Where a redirect leads is checked before it's followed, and
 * so is a response's URL that isn't the URL that was asked for, like a
 * symlink's real path, or where a redirect a browser followed led.
 *
 * @type (stack: Fetcher, request: Request, ctx: FetchContext, policy: FollowPolicy, added: Headers) => Promise<Response>
 */
export const follow = async (stack, request, ctx, policy, added) => {
  const mode = request.redirect;
  const urls = [request.url];
  let current = request;

  for (let hops = 0; ; hops++) {
    // A copy of the body, in case a 307 or 308 sends it again
    const spare = current.body ? current.clone() : undefined;
    const response = await checked(stack.fetch(withHeaders(current, added, "manual"), ctx), current.url, ctx, policy);

    if (response.type === "opaqueredirect") {
      // A browser doesn't say where a redirect leads, so it follows it
      void spare?.body?.cancel().catch(() => {});
      return checked(stack.fetch(withHeaders(spare ?? current, added, mode), ctx), current.url, ctx, policy);
    }

    const location = response.headers.get("location");
    if (!redirectStatuses.has(response.status) || location === null || mode === "manual") {
      void spare?.body?.cancel().catch(() => {});
      return hops === 0 ? response : finish(response, current.url, urls);
    }

    await response.body?.cancel();
    if (mode === "error") {
      throw networkError(`'${current.url}' redirected to '${location}', and redirect is "error"`, { code: "ERR_UNEXPECTED_REDIRECT" });
    }
    if (hops + 1 > policy.max) {
      throw networkError(`'${request.url}' redirected more than ${policy.max} times, the session's 'maxRedirects'`, { code: "ERR_TOO_MANY_REDIRECTS" });
    }
    const target = new URL(location, response.url || current.url);
    if (!policy.schemes.includes(target.protocol)) {
      throw networkError(`'${current.url}' redirected to a ${target.protocol} URL, '${target.href}', which isn't allowed. Add the scheme to the session's 'redirectSchemes' to allow it.`, { code: "ERR_UNSAFE_REDIRECT" });
    }
    if (!target.hash) {
      target.hash = new URL(current.url).hash;
    }
    await check(current.url, target.href, ctx, policy);

    ctx.record.mark("redirect", { status: response.status, from: current.url, to: target.href });
    current = nextHop(spare ?? current, target, response.status, ctx);
    urls.push(target.href);
    added = await policy.headers(target.href);
    ctx.signal.throwIfAborted();
  }
};

/**
 * A response whose URL isn't the one that was asked for is checked too. One
 * from a URL the session can't fetch isn't used.
 *
 * @type (pending: Promise<Response>, url: string, ctx: FetchContext, policy: FollowPolicy) => Promise<Response>
 */
const checked = async (pending, url, ctx, policy) => {
  const response = await pending;
  const asked = new URL(url);
  asked.hash = "";
  if (response.url && response.url !== asked.href) {
    try {
      await check(url, response.url, ctx, policy);
    } catch (error) {
      await response.body?.cancel();
      throw error;
    }
  }
  return response;
};

/**
 * Check a URL that fetching `url` led to, like where a redirect leads: the
 * document the request comes from has to be able to refer to it, and the
 * session has to allow it
 *
 * @type (url: string, to: string, ctx: FetchContext, policy: FollowPolicy) => Promise<void>
 */
const check = async (url, to, ctx, policy) => {
  const referrer = referrerOf(ctx.record.initiator);
  if (!canRefer(to, referrer)) {
    throw refusedReferenceResponse(url, to, /** @type string */ (referrer));
  }
  if (!await policy.allows(to)) {
    throw refusedResponse(url, to);
  }
};

/**
 * The request as it's sent down the stack, with the session's headers for its
 * URL
 *
 * @type (request: Request, added: Headers, redirect: RequestRedirect) => Request
 */
const withHeaders = (request, added, redirect) => new Request(request, { headers: sentHeaders(request.headers, added), redirect });

/**
 * A request's own headers with the session's, which don't replace its own
 *
 * @type (own: Headers, added: Headers) => Headers
 */
export const sentHeaders = (own, added) => {
  const headers = new Headers(added);
  for (const [name, value] of own) {
    headers.set(name, value);
  }
  return headers;
};

/**
 * The request a redirect leads to, by the Fetch standard: a 301 or 302 makes
 * a POST a GET, and a 303 makes anything but GET or HEAD a GET, without the
 * body. `Authorization` isn't sent to another origin.
 *
 * @type (previous: Request, target: URL, status: number, ctx: FetchContext) => Request
 */
const nextHop = (previous, target, status, ctx) => {
  let method = previous.method;
  /** @type BodyInit | null */
  let body = previous.body;
  const headers = new Headers(previous.headers);

  const toGet = ((status === 301 || status === 302) && method === "POST")
    || (status === 303 && method !== "GET" && method !== "HEAD");
  if (toGet) {
    method = "GET";
    void previous.body?.cancel().catch(() => {});
    body = null;
    for (const name of bodyHeaders) {
      headers.delete(name);
    }
  }
  if (new URL(previous.url).origin !== target.origin) {
    headers.delete("authorization");
  }

  return new Request(target, {
    method,
    headers,
    body,
    signal: ctx.signal,
    redirect: previous.redirect,
    // Node.js needs it for a streamed body
    ...body ? { duplex: "half" } : {}
  });
};

/** @type (response: Response, finalUrl: string, urls: string[]) => Response */
const finish = (response, finalUrl, urls) => {
  const url = new URL(response.url || finalUrl);
  url.hash = "";
  withUrl(response, url.href);
  Object.defineProperty(response, "redirected", { value: true, configurable: true });
  return setResponseMeta(response, { redirects: urls });
};
