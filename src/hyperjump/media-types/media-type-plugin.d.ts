import type { JrefNode } from "../../jref/jrefast.d.ts";


export type DocumentNode = {
  type: string;
  children: JrefNode[];
  uri?: string;
  embedded?: Record<string, DocumentNode>;
  anchors?: Record<string, string>;
  fragmentKind?: string;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface MediaTypePlugin<T extends DocumentNode> {
  mediaType: string;
  extensions: string[];
  quality?: number;
  parse: (response: Response) => Promise<T>;
};
