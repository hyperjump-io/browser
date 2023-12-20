import { createReadStream } from "node:fs";
import { readlink, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseIri, toAbsoluteIri } from "@hyperjump/uri";
import { getFileMediaType } from "../media-types/media-types.js";


const retrieve = async (uri, baseUri) => {
  const { scheme } = parseIri(baseUri);

  if (baseUri) {
    if (scheme !== "file") {
      throw Error(`Accessing a file (${uri}) from a non-filesystem document (${baseUri}) is not allowed`);
    }
  }

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

  return response;
};

export const fileSchemePlugin = { retrieve };
