import type { GetOptions } from "../hyperjump.js";

export interface UriSchemePlugin {
  schemes: string[];
  retrieve(uri: string, options: GetOptions): Promise<Response>;
}
