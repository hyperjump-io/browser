import type { DocumentSession } from "../documents/documents.d.ts";
import type { jrefMediaType } from "./jref-media-type.d.ts";
import type { jsonMediaType } from "./json-media-type.d.ts";

/** A parsed document. `T` is the type of its nodes. */
export type DocumentNode<T = unknown> = {
  type: string;
  children: T[];

  /** The document's URL, which its nodes' locations start with */
  url: string;

  /**
   * The documents this one contains, parsed, by the URL each says it has.
   * A reference in this document, or in one of them, finds them before
   * anything is retrieved. Nothing else does, so what a document says it
   * contains doesn't change what a reference in another document finds.
   * They aren't retrieved, so `allowRetrieval` doesn't apply to them. A URL
   * has to be absolute.
   */
  embedded?: Record<string, DocumentNode<T>>;
};

/**
 * What the JSON and JRef plugins parse: a response's text and its URL,
 * without a fragment. A `Response` is one, and so is text that's been read
 * already, which is how a plugin that's read a response gives it to them.
 */
export type ParseSource = Pick<Response, "text" | "url">;

/**
 * Parses responses of a media type into documents, and says what the media
 * type's fragments identify. A plugin is a plain object, so one with another
 * quality is `{ ...jsonMediaType, quality: 0.5 }`.
 */
export type MediaTypePlugin<T extends DocumentNode = DocumentNode> = {
  /**
   * The media type, like `application/json`, or a range like `text/*`. It
   * also parses a media type whose structured suffix is its subtype, like
   * `application/problem+json` for `application/json`.
   */
  mediaType: string;

  /**
   * What a file of this media type is named. An extension starts with `.`
   * (`.jref`), and a whole file name starts with `/` (`/.bowerrc`).
   */
  extensions: string[];

  /**
   * The quality of the media type in the `Accept` header, a number from 0 to
   * 1 with at most three decimal places. Without it, there's no quality,
   * which servers take to be 1.
   */
  quality?: number;

  /**
   * Parse a response into a document. The response's `url` is the
   * document's, without a fragment, and its `headers` have what its
   * `Content-Type` says, like a parameter.
   *
   * A media type that needs other documents to parse one, like one that
   * names what defines it, gets them with the session, as
   * `get(session, url, { initiator: response, reference: "manual" })`, so they're
   * requests the document caused. Getting the document that's being parsed
   * waits for itself.
   *
   * @throws If the response can't be a document, like one with a syntax
   * error.
   */
  parse(response: Response, session: DocumentSession): Promise<T>;

  /**
   * The JSON Pointer to the node a fragment identifies. The fragment is
   * percent-encoded. Without this, a fragment identifies the whole document.
   */
  fragmentPointer?(document: T, fragment: string): string;
};

/**
 * The media types parsed by default: JRef, then JSON. It's typed as the two
 * plugins it is, so a list made from it, like
 * `[...defaultMediaTypes, plugin]`, says what its documents are.
 */
export const defaultMediaTypes: readonly [typeof jrefMediaType, typeof jsonMediaType];

/**
 * The `Accept` header for a list of plugins: each media type with its
 * quality, in order, and any media type last.
 *
 * @throws {RangeError} If a quality isn't a number from 0 to 1 with at most
 * three decimal places.
 */
export const acceptHeader: (mediaTypes: readonly MediaTypePlugin[]) => string;

/**
 * The plugin with the most specific match for a `Content-Type`: its own
 * media type, then a structured suffix, then a range. The first plugin wins
 * a tie. It's `undefined` when none matches, or the header is missing or
 * isn't a media type.
 */
export const mediaTypeForContentType: <P extends MediaTypePlugin>(mediaTypes: readonly P[], contentType: string | null) => P | undefined;

/**
 * The plugin with the longest extension that a URL's path ends with, so
 * `.schema.json` wins over `.json`. The first plugin wins a tie. An
 * extension isn't a whole file name, so `/.json` has none.
 */
export const mediaTypeForExtension: <P extends MediaTypePlugin>(mediaTypes: readonly P[], url: string) => P | undefined;
