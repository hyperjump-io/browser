import { parse } from "../jref/index.js";


export const jrefMediaTypePlugin = {
  parse: async (response, fragment) => {
    return {
      baseUri: response.url,
      cursor: fragment,
      root: parse(await response.text())
    };
  },
  fileMatcher: (path) => path.endsWith(".jref")
};
