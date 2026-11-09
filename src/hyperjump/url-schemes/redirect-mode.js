/**
 * The `http(s):` plugin returns a redirect instead of following it, so the
 * session checks where it leads against `allowRetrieval` before it's
 * requested, and each request gets the headers for its own URL
 *
 * @type RequestRedirect
 */
export const redirectMode = "manual";
