import type { JrefNode } from "../../jref/jref-ast.js";
import type { Session } from "../hyperjump.d.ts";

/**
 * A parsed document. `T` is the type of its nodes.
 */
export type DocumentNode<T = JrefNode> = {
  type: string;
  children: T[];
  uri?: string;
  /**
   * The media type of the plugin that parsed it, which defines what its
   * fragments identify. It's set on every document a plugin parses.
   */
  mediaType?: string;
};

export interface MediaTypePlugin<T extends DocumentNode<unknown>> {
  mediaType: string;
  /**
   * Extensions start with `.` (Example: `.jref`).
   * Filenames start with `/` (Example: `/.bowerrc`)
   */
  extensions: string[];
  quality?: number;
  /**
   * @param session - The session the document is being retrieved for. A
   * media type that needs other resources to parse a document, such as a
   * schema's meta-schema, retrieves them in this session.
   */
  parse(response: Response, session: Session<any>): Promise<T>;

  /**
   * The JSON Pointer to the node a fragment identifies. The fragment is
   * percent-encoded. Without this, fragments are ignored and identify the
   * whole document.
   */
  fragmentPointer?(document: T, fragment: string): string;
}
