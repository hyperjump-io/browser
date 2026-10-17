import type { JrefNode } from "../../jref/jref-ast.js";

/**
 * A parsed document. `T` is the type of its nodes.
 */
export type DocumentNode<T = JrefNode> = {
  type: string;
  children: T[];
  uri?: string;
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
  parse(response: Response): Promise<T>;
}
