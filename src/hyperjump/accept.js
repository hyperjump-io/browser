/**
 * @import { Layer } from "./layers.js"
 */

/**
 * The `Accept` layer. A request gets the `Accept` header for the media type
 * plugins, so a URL scheme plugin sends what can be parsed. It replaces one
 * the request has, because the media type plugins depend on it.
 *
 * @type (accept: string) => Layer
 */
export const acceptLayer = (accept) => (next) => async (request) => {
  const headers = new Headers(request.headers);
  headers.set("accept", accept);
  return next(new Request(request.url, { headers }));
};
