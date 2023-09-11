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

export class HttpError extends Error {
  public response: Response;

  public constructor(response: Response, message?: string);
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

export class UnsupportedMediaTypeError extends Error {
  public constructor(mediaType: string, message?: string);
}

export class UnknownMediaTypeError extends Error {
  public constructor(message?: string);
}

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

export class UnsupportedUriSchemeError extends Error {
  public scheme: string;

  public constructor(scheme: string, message?: string);
}
