#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { args } from "unified-args";
import { rejson } from "./rejson.js";

/**
 * @typedef {{
 *   version: string;
 * }} Package
 */

const packageJsonUrl = new URL("../../package.json", import.meta.url);

/** @type Package */
const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));

args({
  description: "CLI to process JSON with rejson",
  extensions: ["json"],
  ignoreName: ".rejsonignore",
  name: "rejson",
  packageField: "rejsonConfig",
  pluginPrefix: "rejson",
  processor: rejson,
  rcName: ".rejsonrc",
  version: `rejson: ${packageJson.version}`
});
