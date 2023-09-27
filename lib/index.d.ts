import type { Response } from "undici";
import type { JRef } from "./jref/index.js";


// Browser
export type Document = {
  baseUri: string;
  cursor: string;
  root: JRef;
};

export const get: (uri: string, document?: Document) => Promise<Document>;
export const value: (document: Document) => unknown;
export const step: (key: string, document: Document) => Promise<Document>;
export const iter: (document: Document) => AsyncGenerator<Document>;
export const keys: (document: Document) => Generator<string>;
export const values: (document: Document) => AsyncGenerator<string>;
export const entries: (document: Document) => AsyncGenerator<[string, Document]>;

export class RetrievalError extends Error {
  public constructor(message: string, cause: Error);
}

// Media Types
export type MediaTypePlugin = {
  parse: (response: Response, fragment: string) => Promise<Document>;
  fileMatcher: (path: string) => Promise<boolean>;
  quality?: number;
};

export const addMediaTypePlugin: (contentType: string, plugin: MediaTypePlugin) => void;
export const removeMediaTypePlugin: (contentType: string) => void;
export const setMediaTypeQuality: (contentType: string, quality: number) => void;

// URI Schemes
export type UriSchemePlugin = {
  retrieve: typeof retrieve;
};

export const addUriSchemePlugin: (scheme: string, plugin: UriSchemePlugin) => void;
export const removeUriSchemePlugin: (scheme: string) => void;
export const retrieve: (uri: string, document?: Document) => Promise<{
  response: Response;
  fragment: string;
}>;
