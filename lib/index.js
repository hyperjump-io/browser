import { addMediaTypePlugin } from "./media-types.js";
import { jrefMediaTypePlugin } from "./jref-media-type-plugin.js";
import { addUriSchemePlugin } from "./uri-schemes.js";
import { httpSchemePlugin } from "./http-scheme-plugin.js";
import { fileSchemePlugin } from "./file-scheme-plugin.js";


addMediaTypePlugin("application/reference+json", jrefMediaTypePlugin);

addUriSchemePlugin("http", httpSchemePlugin);
addUriSchemePlugin("https", httpSchemePlugin);
addUriSchemePlugin("file", fileSchemePlugin);

export { get, value } from "./browser.js";
export {
  addMediaTypePlugin,
  removeMediaTypePlugin,
  setMediaTypeQuality,
  UnknownMediaTypeError,
  UnsupportedMediaTypeError
} from "./media-types.js";
export { HttpError } from "./http-scheme-plugin.js";
export {
  addUriSchemePlugin,
  removeUriSchemePlugin,
  retrieve,
  UnsupportedUriSchemeError
} from "./uri-schemes.js";
