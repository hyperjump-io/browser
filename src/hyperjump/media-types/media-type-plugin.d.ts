export type DocumentNode<A> = {
  type: string;
  children: A[];
  uri?: string;
  embedded?: Record<string, DocumentNode<A>>;
  anchors?: Record<string, string>;
  fragmentKind?: string;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface MediaTypePlugin<T extends DocumentNode<unknown>> {
  mediaType: string;
  /**
   * Extensions start with `.` (Example: `.jref`).
   * Filenames start with `/` (Example: `/.bowerrc`)
   */
  extensions: string[];
  quality?: number;
  parse: (response: Response) => Promise<T>;
};
