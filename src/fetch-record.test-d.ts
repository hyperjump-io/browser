// What FetchRecord's types say about making one. It's only type-checked.
import { FetchRecord } from "./index.js";

// @ts-expect-error A record is made by the session
new FetchRecord();

/** A record can still be checked for, like a trace's */
export const isRecord = (value: unknown): value is FetchRecord => value instanceof FetchRecord;
