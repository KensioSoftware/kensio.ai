#!/usr/bin/env node
// Writes one version into every manifest in the repo.
//
// Skills are versioned in lockstep: the root package.json, each plugin's
// package.json, and each plugin's plugin.json all carry the same number. That
// makes "everything at 1.4.0 came from one commit" true across the marketplace
// and npm, at the cost of republishing plugins that did not change.
//
// semantic-release calls this from its prepare step; run it by hand only if you
// are repairing a release.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "")) {
  console.error(`Usage: set-version.mjs <version>   (got ${version ?? "nothing"})`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = resolve(root, "plugins");

const setVersion = (path) => {
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  return relative(root, path);
};

const written = [resolve(root, "package.json")];

for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  written.push(
    resolve(pluginsDir, entry.name, "package.json"),
    resolve(pluginsDir, entry.name, ".claude-plugin/plugin.json"),
  );
}

for (const path of written) console.log(`  ${setVersion(path)} → ${version}`);

// Re-format so the release commit cannot drift from what format:check expects.
const formatted = spawnSync("npx", ["oxfmt", ...written], { stdio: "inherit" });
if (formatted.status !== 0) {
  console.error("✖ oxfmt failed on the version-bumped manifests");
  process.exit(1);
}

console.log(`\n✔ ${written.length} manifests set to ${version}`);
