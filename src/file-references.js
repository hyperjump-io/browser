import { networkError, responseMeta } from "./response-meta.js";
import { relativeFileUrl } from "./file-urls.js";

/**
 * @import { FetchRecord } from "./fetch-record.d.ts"
 */

/**
 * The URL of the document a request comes from: its initiator's response,
 * or what it asked for if there's no response yet
 *
 * @type (initiator: FetchRecord | undefined) => string | undefined
 */
export const referrerOf = (initiator) => initiator && (initiator.finalUrl ?? initiator.url);

/**
 * The URL of the document a request comes from, from what caused it: the
 * `referrer` it's given, which wins, or its initiator's. A `Response`
 * initiator is its record's.
 *
 * @type (initiator: FetchRecord | Response | undefined, referrer: string | URL | undefined) => string | undefined
 */
export const referrerFor = (initiator, referrer) => referrer === undefined
  ? referrerOf(initiator instanceof Response ? responseMeta(initiator).record : initiator)
  : new URL(referrer).href;

/**
 * Whether a document at `referrer` can refer to `url`. Only a `file:`
 * document can refer to a `file:` URL, so a document from the web can't read
 * files. A request without a referrer is the application's own.
 *
 * @type (url: string, referrer: string | undefined) => boolean
 */
export const canRefer = (url, referrer) => referrer === undefined
  || !url.startsWith("file:")
  || referrer.startsWith("file:");

const onlyFiles = "Only a file: document can refer to a file: URL.";

/** @type (url: string, referrer: string) => TypeError */
export const refusedReference = (url, referrer) => networkError(`Fetching '${relativeFileUrl(url)}' isn't allowed from '${relativeFileUrl(referrer)}'. ${onlyFiles}`, { code: "ERR_FILE_REFERENCE_NOT_ALLOWED" }, url);

/** @type (url: string, responseUrl: string, referrer: string) => TypeError */
export const refusedReferenceResponse = (url, responseUrl, referrer) => networkError(`Fetching '${relativeFileUrl(url)}' led to '${relativeFileUrl(responseUrl)}', which isn't allowed from '${relativeFileUrl(referrer)}'. ${onlyFiles}`, { code: "ERR_FILE_REFERENCE_NOT_ALLOWED" }, responseUrl);
