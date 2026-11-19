import { networkError, setResponseMeta, withUrl } from "./response-meta.js";
import { refusedResponse } from "./allowed-urls.js";
import { canRefer, refusedReferenceResponse } from "./file-references.js";
import { relativeFileUrl } from "./file-urls.js";

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

/**
 * The schemes a session's redirects can lead to: its `redirectSchemes`, or
 * `http:` and `https:`. A redirect can never lead to a file, because it's
 * what a server says, and a server can't choose which of the application's
 * files a request reads. A file is the registry's, or a layer's that
 * answers a URL with it, so `file:` is a mistake in the session's options.
 *
 * @type (schemes: string[] | undefined) => string[]
 * @throws {TypeError} If `file:` is one of them.
 */
export const redirectSchemesOf = (schemes = ["http:", "https:"]) => {
  if (schemes.some((scheme) => scheme.toLowerCase() === "file:")) {
    throw TypeError("A redirect can't lead to a file: URL, so 'redirectSchemes' can't have file:. To answer a URL with a file, use a registry or a layer.");
  }
  return [...schemes];
};

/**
 * The credentials HTTP defines (RFC 9110 and RFC 6265), which a redirect
 * doesn't send to another origin. A browser doesn't let a page set `Cookie`
 * or `Proxy-Authorization`, and sends its own cookies for each origin, and
 * Node.js's `fetch` drops all three.
 */
const credentialHeaders = ["authorization", "cookie", "proxy-authorization"];

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
    const sending = current;
    try {
      const response = await checked(stack.fetch(withHeaders(current, added, "manual"), ctx), current.url, ctx, policy);

      if (response.type === "opaqueredirect") {
        // A browser doesn't say where a redirect leads
        if (mode === "manual") {
          void spare?.body?.cancel().catch(() => {});
          return response;
        }
        if (mode === "error") {
          throw networkError(`'${relativeFileUrl(current.url)}' redirected, and redirect is "error"`, { code: "ERR_UNEXPECTED_REDIRECT" }, current.url);
        }
        // So it's asked again, to follow it, with the copy of the body, since
        // the request's was sent. The session's headers are for this URL, and
        // the browser would send them wherever the redirect leads, so they
        // aren't sent again.
        return checked(stack.fetch(new Request(spare ?? current, { redirect: mode }), ctx), current.url, ctx, policy);
      }

      const location = response.headers.get("location");
      if (!redirectStatuses.has(response.status) || location === null || mode === "manual") {
        void spare?.body?.cancel().catch(() => {});
        return hops === 0 ? response : finish(response, current.url, urls);
      }

      await response.body?.cancel();
      if (mode === "error") {
        throw networkError(`'${relativeFileUrl(current.url)}' redirected to '${location}', and redirect is "error"`, { code: "ERR_UNEXPECTED_REDIRECT" }, current.url);
      }
      if (hops + 1 > policy.max) {
        throw networkError(`'${relativeFileUrl(request.url)}' redirected more than ${policy.max} times, the limit in 'maxRedirects'`, { code: "ERR_TOO_MANY_REDIRECTS" }, request.url);
      }
      // As in the Fetch standard, a `Location` that isn't a URL is a network
      // error. A request can't be made for a URL with a username or password
      // in it, so that's one too.
      const target = URL.parse(location, response.url || current.url);
      if (!target) {
        throw networkError(`'${relativeFileUrl(current.url)}' redirected to '${location}', which isn't a URL`, { code: "ERR_INVALID_REDIRECT" }, current.url);
      }
      if (target.username || target.password) {
        throw networkError(`'${relativeFileUrl(current.url)}' redirected to a URL with a username or password in it, which a request can't have`, { code: "ERR_INVALID_REDIRECT" }, current.url);
      }
      if (target.protocol === "file:") {
        throw networkError(`'${relativeFileUrl(current.url)}' redirected to a file: URL, '${relativeFileUrl(target.href)}'. A redirect can't lead to a file.`, { code: "ERR_UNSAFE_REDIRECT" }, target.href);
      }
      if (!policy.schemes.includes(target.protocol)) {
        throw networkError(`'${relativeFileUrl(current.url)}' redirected to a ${target.protocol} URL, '${relativeFileUrl(target.href)}', which isn't allowed. Add the scheme to 'redirectSchemes' to allow it.`, { code: "ERR_UNSAFE_REDIRECT" }, target.href);
      }
      if (!target.hash) {
        target.hash = new URL(current.url).hash;
      }
      await check(current.url, target.href, ctx, policy);

      const from = current.url;
      current = nextHop(spare ?? current, target, response.status);
      urls.push(target.href);
      added = await policy.headers(target.href);
      // The next request's headers are worked out again, so the mark says what
      // they are
      ctx.record.mark("redirect", { status: response.status, from, to: target.href, requestHeaders: [...sentHeaders(current.headers, added)] });
      current.signal.throwIfAborted();
    } catch (error) {
      // The copy of the body won't be sent, and holds what it was copied
      // from open. Once it's the next request's, that request's body is it.
      void spare?.body?.cancel().catch(() => {});
      if (current !== sending) {
        void current.body?.cancel().catch(() => {});
      }
      throw error;
    }
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
  const { referrer } = ctx.record;
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
 * body. `Authorization`, `Cookie`, and `Proxy-Authorization` aren't sent to
 * another origin.
 *
 * @type (previous: Request, target: URL, status: number) => Request
 */
const nextHop = (previous, target, status) => {
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
    for (const name of credentialHeaders) {
      headers.delete(name);
    }
  }

  return new Request(target, {
    method,
    headers,
    body,
    signal: previous.signal,
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
