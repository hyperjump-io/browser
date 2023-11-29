import type { Response } from "undici";
import type { JRef } from "./jref/index.js";


// Browser
export type Browser<T extends Document = Document> = {
  uri: string;
  document: T;
  cursor: string;
  cache: Record<string, { source: string, document: Document }>;
};

export type Document = {
  baseUri: string;
  root: JRef;
  anchorLocation: (anchor: string | undefined) => string;
  embedded?: Record<string, Document>;
};

export const get: <T extends Document>(uri: string, browser?: Browser) => Promise<Browser<T>>;
export const value: (browser: Browser) => unknown;
export const step: <T extends Document>(key: string, browser: Browser) => Promise<Browser<T>>;
export const iter: <T extends Document>(browser: Browser) => AsyncGenerator<Browser<T>>;
export const keys: (browser: Browser) => Generator<string>;
export const values: (browser: Browser) => AsyncGenerator<string>;
export const entries: <T extends Document>(browser: Browser) => AsyncGenerator<[string, Browser<T>]>;

export class RetrievalError extends Error {
  public constructor(message: string, cause: Error);
  public get cause(): Error;
}

// Media Types
export type MediaTypePlugin<T extends Document = Document> = {
  parse: (response: Response) => Promise<T>;
  fileMatcher: (path: string) => Promise<boolean>;
  quality?: number;
};

export const addMediaTypePlugin: <T extends Document>(contentType: string, plugin: MediaTypePlugin<T>) => void;
export const removeMediaTypePlugin: (contentType: string) => void;
export const setMediaTypeQuality: (contentType: string, quality: number) => void;

// URI Schemes
export type UriSchemePlugin = {
  retrieve: typeof retrieve;
};

export const retrieve: (uri: string, baseUri?: string) => Promise<{ response: Response, fragment: string }>;
export const addUriSchemePlugin: (scheme: string, plugin: UriSchemePlugin) => void;
export const removeUriSchemePlugin: (scheme: string) => void;
