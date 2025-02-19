#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { args } from "unified-args";
import { jref } from "./jref.js";


/**
 * @typedef {{
 *   version: string;
 * }} Package
 */

const packageJsonUrl = new URL("../../package.json", import.meta.url);

/** @type Package */
const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8")); // eslint-disable-line @typescript-eslint/no-unsafe-assignment

args({
  description: "CLI to process JRef",
  extensions: ["jref"],
  ignoreName: ".jrefignore",
  name: "jref",
  packageField: "jrefConfig",
  pluginPrefix: "jref",
  processor: jref,
  rcName: ".jrefrc",
  version: `jref: ${packageJson.version}`
});
