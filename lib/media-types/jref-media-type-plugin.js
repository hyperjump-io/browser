import { parse } from "../jref/index.js";


export const jrefMediaTypePlugin = {
  parse: async (response) => {
    return {
      baseUri: response.url,
      root: parse(await response.text()),
      anchorLocation: anchorLocation
    };
  },
  fileMatcher: (path) => path.endsWith(".jref")
};

const anchorLocation = (fragment) => decodeURI(fragment || "");
