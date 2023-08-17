import type { JRef } from "./jref/index.js";


export type Browser = {
  uri: string;
  cursor: string;
  document: Document;
};

export type Document = {
  value: JRef;
};

export const get: (uri: string) => Promise<Browser>;
export const value: (browser: Browser) => unknown;

export class HttpError extends Error {
  public response: Response;

  public constructor(response: Response, message?: string);
}

export type MediaTypePlugin = {
  parse: (response: Response) => Promise<Document>;
  quality?: number;
};

export const addMediaTypePlugin: (contentType: string, plugin: MediaTypePlugin) => void;
export const removeMediaTypePlugin: (contentType: string) => void;
export const setMediaTypeQuality: (contentType: string, quality: number) => void;

export class UnsupportedMediaTypeError extends Error {
}

export class UnknownMediaTypeError extends Error {
}
