import type { JrefNode } from "../../jref/jref-ast.js";
import type { Session } from "../hyperjump.d.ts";

/**
 * A parsed document. `T` is the type of its nodes.
 */
export type DocumentNode<T = JrefNode> = {
  type: string;
  children: T[];
  /** The document's URL, which its nodes' locations start with */
  url: string;
  /**
   * The media type that defines what its fragments identify. It's the media
   * type of the plugin that parsed it, unless the plugin set another one,
   * for a document it found to be in a more specific media type, like JSON
   * that's a JSON Schema.
   */
  mediaType?: string;
  /**
   * The documents this one contains, by the URL each says it has. Each of
   * them has the same set, so a reference in one finds the others. One is
   * only found by a reference from a document with this set, so it doesn't
   * change what a reference in another document finds. It isn't retrieved,
   * and `allowRetrieval` doesn't apply to it. A URL that isn't a URL fails
   * the retrieval. An embedded document is in this one's media type unless
   * it has its own `mediaType`.
   */
  embedded?: Record<string, DocumentNode<T>>;
};

/**
 * The response a media type plugin parses. The session gives it a `url`,
 * without a fragment, even if its URL scheme plugin's response didn't have
 * one, so it can be a document's `url`.
 */
export type RetrievedResponse = Response;

export interface MediaTypePlugin<T extends DocumentNode<unknown>> {
  mediaType: string;
  /**
   * Extensions start with `.` (Example: `.jref`).
   * Filenames start with `/` (Example: `/.bowerrc`)
   */
  extensions: string[];

  /**
   * The quality of the media type in the `Accept` header, a number from 0 to
   * 1 with at most three decimal places. The `Hyperjump` throws for any
   * other value when it's created. It's read then, so changing it later
   * doesn't change the header.
   */
  quality?: number;
  /**
   * @param session - The session the document is being retrieved for. A
   * media type that needs other resources to parse a document, such as a
   * schema's meta-schema, retrieves them in this session.
   */
  parse(response: RetrievedResponse, session: Session<any>): Promise<T>;

  /**
   * The JSON Pointer to the node a fragment identifies. The fragment is
   * percent-encoded. Without this, fragments are ignored and identify the
   * whole document.
   */
  fragmentPointer?(document: T, fragment: string): string;
}
