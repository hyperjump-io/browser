import { createReadStream } from "node:fs";
import { readlink, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseIriReference, toAbsoluteIri } from "@hyperjump/uri";
import { getFileMediaType } from "./media-types.js";


const retrieve = async (uri, document) => {
  if (document) {
    const { baseScheme } = parseIriReference(document.baseUri);
    if (baseScheme !== "file") {
      throw Error(`Accessing a file (${uri}) from a non-filesystem document (${document.baseUri}) is not allowed`);
    }
  }

  const { fragment } = parseIriReference(uri);
  let responseUri = toAbsoluteIri(uri);

  const filePath = fileURLToPath(uri);
  const stats = await lstat(filePath);
  if (stats.isSymbolicLink()) {
    responseUri = "file://" + await readlink(filePath);
  }

  const stream = createReadStream(filePath);
  const response = new Response(stream, {
    headers: { "Content-Type": await getFileMediaType(filePath) }
  });
  Object.defineProperty(response, "url", { value: responseUri });

  return { response, fragment };
};

export const fileSchemePlugin = { retrieve };
