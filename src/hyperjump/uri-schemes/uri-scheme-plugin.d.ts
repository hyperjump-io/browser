import { GetOptions } from "../hyperjump.js"; // eslint-disable-line import/named


// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface UriSchemePlugin {
  retrieve(uri: string, options: GetOptions): Promise<Response>;
};
