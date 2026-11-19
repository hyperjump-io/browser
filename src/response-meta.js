/**
 * @import * as API from "./response-meta.d.ts"
 */

/**
 * Meta by response. A `WeakMap`, so a response that's gone takes its meta
 * with it.
 *
 * @type WeakMap<Response, API.ResponseMeta>
 */
const metas = new WeakMap();

/** @type typeof API.responseMeta */
export const responseMeta = (response) => metas.get(response) ?? {};

/** @type typeof API.setResponseMeta */
export const setResponseMeta = (response, meta) => {
  metas.set(response, { ...metas.get(response), ...meta });
  return response;
};

/** @type typeof API.cloneResponse */
export const cloneResponse = (response) => {
  const copy = response.clone();
  copyMeta(response, copy);
  return copy;
};

/** @type typeof API.withUrl */
export const withUrl = (response, url) => {
  // `url` is a getter on the prototype, so an own property shadows it
  Object.defineProperty(response, "url", { value: url, configurable: true });
  return response;
};

/** @type typeof API.replaceBody */
export const replaceBody = (response, body) => {
  const replaced = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
  withUrl(replaced, response.url);
  if (response.redirected) {
    Object.defineProperty(replaced, "redirected", { value: true, configurable: true });
  }
  copyMeta(response, replaced);
  return replaced;
};

/** @type typeof API.trackBody */
export const trackBody = (response, done, onChunk) => {
  let called = false;
  const once = () => {
    if (!called) {
      called = true;
      done();
    }
  };

  if (!response.body || response.type.startsWith("opaque")) {
    once();
    return response;
  }
  return replaceBody(response, tracked(response.body, once, onChunk));
};

/** @type typeof API.networkError */
export const networkError = (message, cause, url) => {
  const error = /** @type ReturnType<typeof API.networkError> */ (new TypeError(message, cause === undefined ? undefined : { cause }));
  if (url !== undefined) {
    error.url = url;
  }
  return error;
};

/** @type (from: Response, to: Response) => void */
const copyMeta = (from, to) => {
  const meta = metas.get(from);
  if (meta) {
    metas.set(to, { ...meta });
  }
};

/**
 * A stream that passes a body through and calls `done` when it ends, fails,
 * or is cancelled
 *
 * @type (body: ReadableStream<Uint8Array>, done: () => void, onChunk?: (chunk: Uint8Array) => void) => ReadableStream<Uint8Array>
 */
const tracked = (body, done, onChunk) => {
  const reader = body.getReader();
  return new ReadableStream({
    start(controller) {
      // A body that fails while nothing is reading it, like one whose request
      // is aborted, would otherwise only be noticed by the next read. It isn't
      // returned, because the stream would wait for it to start.
      void (async () => {
        try {
          await reader.closed;
        } catch (error) {
          done();
          controller.error(error);
        }
      })();
    },
    async pull(controller) {
      try {
        const { done: finished, value } = await reader.read();
        if (finished) {
          done();
          controller.close();
        } else {
          onChunk?.(value);
          controller.enqueue(value);
        }
      } catch (error) {
        done();
        controller.error(error);
      }
    },
    cancel(reason) {
      done();
      return reader.cancel(reason);
    }
  });
};
