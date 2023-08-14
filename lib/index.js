import { addMediaTypePlugin } from "./media-types.js";
import { parse } from "./jref/index.js";


addMediaTypePlugin("application/reference+json", {
  parse: async (response) => {
    return {
      value: parse(await response.text())
    };
  }
});

export { get, HttpError } from "./browser.js";
export {
  addMediaTypePlugin,
  removeMediaTypePlugin,
  setMediaTypeQuality,
  UnknownMediaTypeError,
  UnsupportedMediaTypeError
} from "./media-types.js";
