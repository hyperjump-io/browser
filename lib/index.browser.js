import { addMediaTypePlugin } from "./media-types/media-types.js";
import { jrefMediaTypePlugin } from "./media-types/jref-media-type-plugin.js";
import { addUriSchemePlugin } from "./uri-schemes/uri-schemes.js";
import { httpSchemePlugin } from "./uri-schemes/http-scheme-plugin.js";


addMediaTypePlugin("application/reference+json", jrefMediaTypePlugin);

addUriSchemePlugin("http", httpSchemePlugin);
addUriSchemePlugin("https", httpSchemePlugin);

export {
  get,
  value,
  step
} from "./browser/browser.js";
export {
  addMediaTypePlugin,
  removeMediaTypePlugin,
  setMediaTypeQuality,
  UnknownMediaTypeError,
  UnsupportedMediaTypeError
} from "./media-types/media-types.js";
export {
  HttpError
} from "./uri-schemes/http-scheme-plugin.js";
export {
  addUriSchemePlugin,
  removeUriSchemePlugin,
  retrieve,
  UnsupportedUriSchemeError
} from "./uri-schemes/uri-schemes.js";
