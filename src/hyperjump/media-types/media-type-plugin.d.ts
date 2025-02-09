import type { JrefNode } from "../../jref/jrefast.d.ts";


export type DocumentNode = {
  uri?: string;
  embedded?: Record<string, DocumentNode>;
  anchors?: Record<string, string>;
  fragmentKind?: string;
  children: JrefNode[];
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface MediaTypePlugin<T extends DocumentNode> {
  parse: (response: Response) => Promise<T>;
  fileMatcher: (path: string) => Promise<boolean>;
  quality?: number;
};
