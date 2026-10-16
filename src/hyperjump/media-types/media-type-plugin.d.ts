import type { JrefNode } from "../../jref/jref-ast.js";

/**
 * A parsed document. `T` is the type of its nodes.
 */
export type DocumentNode<T = JrefNode> = {
  type: string;
  children: T[];
  uri?: string;
  /**
   * Documents embedded in this one, by URI. Every document in a compound
   * document should share the same `embedded` object, so any of them can find
   * any other. Embedded documents are only visible to references from within
   * the compound document that contains them.
   */
  embedded?: Record<string, DocumentNode<T>>;
  anchors?: Record<string, string>;
  fragmentKind?: string;
};

export interface MediaTypePlugin<T extends DocumentNode<unknown>> {
  mediaType: string;
  /**
   * Extensions start with `.` (Example: `.jref`).
   * Filenames start with `/` (Example: `/.bowerrc`)
   */
  extensions: string[];
  quality?: number;
  parse: (response: Response) => Promise<T>;
}
