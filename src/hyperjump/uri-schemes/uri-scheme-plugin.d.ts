// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface UriSchemePlugin {
  retrieve(uri: string, baseUri: string): Promise<Response>;
};
