import { GetOptions } from "../hyperjump.js";


// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface UriSchemePlugin {
  schemes: string[];
  retrieve(uri: string, options: GetOptions): Promise<Response>;
};
