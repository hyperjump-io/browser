import { expect } from "vitest";

/**
 * Matches an error by its `cause.code`, and by its `url` if one's given, for
 * `toThrow` and `rejects.toThrow`
 *
 * @type (code: string, url?: string) => Error
 */
export const coded = (code, url) => /** @type Error */ (expect.objectContaining({
  cause: expect.objectContaining({ code }),
  ...url === undefined ? {} : { url }
}));
