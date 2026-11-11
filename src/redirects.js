import { networkError, setResponseMeta, withUrl } from "./response-meta.js";

/**
 * @import { FetchContext, Fetcher } from "./layers.d.ts"
 */

/**
 * @typedef {{ max: number, schemes: string[] }} RedirectPolicy
 */

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/** Headers about a request's body, which go when a redirect makes it a GET */
const bodyHeaders = ["content-encoding", "content-language", "content-location", "content-type", "content-length"];

/**
 * Follow redirects one at a time, each as a new request down the stack, so
 * every layer sees each URL
 *
 * @type (stack: Fetcher, request: Request, ctx: FetchContext, policy: RedirectPolicy) => Promise<Response>
 */
export const follow = async (stack, request, ctx, policy) => {
  const mode = request.redirect;
  const urls = [request.url];
  let current = request;

  for (let hops = 0; ; hops++) {
    // A copy of the body, in case a 307 or 308 sends it again
    const spare = current.body ? current.clone() : undefined;
    const response = await stack.fetch(withRedirectMode(current, "manual"), ctx);

    if (response.type === "opaqueredirect") {
      // A browser doesn't say where a redirect leads, so it follows it
      void spare?.body?.cancel().catch(() => {});
      return stack.fetch(withRedirectMode(spare ?? current, mode), ctx);
    }

    const location = response.headers.get("location");
    if (!redirectStatuses.has(response.status) || location === null || mode === "manual") {
      void spare?.body?.cancel().catch(() => {});
      return hops === 0 ? response : finish(response, current.url, urls);
    }

    await response.body?.cancel();
    if (mode === "error") {
      throw networkError(`'${current.url}' redirected to '${location}', and redirect is "error"`);
    }
    if (hops + 1 > policy.max) {
      throw networkError(`'${request.url}' redirected more than ${policy.max} times`);
    }
    const target = new URL(location, response.url || current.url);
    if (!policy.schemes.includes(target.protocol)) {
      throw networkError(`'${current.url}' redirected to a ${target.protocol} URL, '${target.href}', which isn't allowed`);
    }
    if (!target.hash) {
      target.hash = new URL(current.url).hash;
    }

    ctx.record.mark("redirect", { status: response.status, from: current.url, to: target.href });
    current = nextHop(spare ?? current, target, response.status, ctx);
    urls.push(target.href);
  }
};

/** @type (request: Request, redirect: RequestRedirect) => Request */
const withRedirectMode = (request, redirect) => request.redirect === redirect ? request : new Request(request, { redirect });

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
