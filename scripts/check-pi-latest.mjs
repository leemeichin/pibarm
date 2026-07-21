#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const pinned = pkg.devDependencies?.["@earendil-works/pi-coding-agent"];
if (!pinned) throw new Error("Pi is not pinned in devDependencies");

const response = await fetch("https://registry.npmjs.org/@earendil-works%2fpi-coding-agent/latest");
if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
const latest = (await response.json()).version;
const current = pinned.replace(/^[^0-9]*/, "");

console.log(`Pi pinned: ${current}`);
console.log(`Pi latest: ${latest}`);
if (current !== latest) {
  console.log(`Review upstream changes: https://github.com/earendil-works/pi/releases/tag/v${latest}`);
  if (process.argv.includes("--fail-on-outdated")) process.exitCode = 1;
}
