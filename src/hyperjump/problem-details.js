/**
 * Errors are responses, explained in the body as Problem Details (RFC 9457)
 */

const problemMediaType = "application/problem+json";

/**
 * The `detail` comes from outside, so it's cut to this many characters
 */
const maxDetailLength = 300;

/**
 * A response for a layer that answers with an error. Its `url` is the URL
 * the error is about.
 *
 * @type (url: string, status: number, statusText: string, detail: string) => Response
 */
export const problemResponse = (url, status, statusText, detail) => {
  const body = JSON.stringify({ status, title: statusText, detail });
  const response = new Response(body, { status, statusText, headers: { "content-type": problemMediaType } });
  Object.defineProperty(response, "url", { value: url });
  return response;
};

/**
 * A response's Problem Details `detail`, made safe for a message, or
 * `undefined` if it doesn't have one. A body that isn't Problem Details is
 * cancelled, so its file or connection is released.
 *
 * @type (response: Response) => Promise<string | undefined>
 */
export const problemDetail = async (response) => {
  if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== problemMediaType) {
    await response.body?.cancel();
    return undefined;
  }

  let problem;
  try {
    problem = /** @type unknown */ (JSON.parse(await response.text()));
  } catch {
    return undefined;
  }

  const detail = typeof problem === "object" && problem !== null && "detail" in problem ? problem.detail : undefined;
  if (typeof detail !== "string") {
    return undefined;
  }

  // Control characters could change what a terminal shows
  // eslint-disable-next-line no-control-regex
  const safe = detail.replaceAll(/[\0-\x1F\x7F-\x9F]/g, "");
  return safe.length > maxDetailLength ? `${safe.slice(0, maxDetailLength)}…` : safe;
};
