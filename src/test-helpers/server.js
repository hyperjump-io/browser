import { createServer } from "node:http";

/**
 * @import { IncomingMessage, ServerResponse } from "node:http"
 * @import { AddressInfo } from "node:net"
 */

/**
 * @typedef {{
 *   url: string;
 *   hits: Map<string, number>;
 *   requests: IncomingMessage[];
 *   close: () => Promise<void>;
 * }} TestServer
 */

/**
 * A server on a random local port. `hits` counts requests by path.
 *
 * @type (handler: (request: IncomingMessage, response: ServerResponse) => void) => Promise<TestServer>
 */
export const startServer = async (handler) => {
  /** @type Map<string, number> */
  const hits = new Map();
  /** @type IncomingMessage[] */
  const requests = [];
  const server = createServer((request, response) => {
    const path = new URL(/** @type string */ (request.url), "http://localhost").pathname;
    hits.set(path, (hits.get(path) ?? 0) + 1);
    requests.push(request);
    handler(request, response);
  });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(undefined));
  });
  const { port } = /** @type AddressInfo */ (server.address());

  return {
    url: `http://127.0.0.1:${port}`,
    hits,
    requests,
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    })
  };
};

/**
 * Wait for work that happens after a response is given, like the HTTP cache
 * storing it once its body is read
 *
 * @type () => Promise<void>
 */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/**
 * The body of a request a server got
 *
 * @type (request: IncomingMessage) => Promise<string>
 */
export const readBody = async (request) => {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
};
