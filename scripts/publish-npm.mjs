#!/usr/bin/env node
// Publishes every plugin to npm at the version semantic-release just set.
//
// Gated on the PUBLISH_NPM repository variable so the release workflow can be
// merged, tagged and exercised before anything becomes permanent on npm. Set the
// variable to "true" once the packages are ready to exist publicly:
//
//   gh variable set PUBLISH_NPM --body true
//
// Uses the npm CLI rather than pnpm, deliberately. Authentication is npm trusted
// publishing (OIDC): the workflow holds no npm token, and npm mints a
// short-lived one from the id-token the job requests. pnpm publish has no OIDC
// support — no --provenance and no trusted-publishing flag as of pnpm 11 — so
// publishing through it would mean going back to a stored NPM_TOKEN. pnpm still
// owns dependency management; npm is here only to publish.
//
// Each plugin directory is published on its own, which also means this does not
// depend on a "workspaces" field that pnpm does not read.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.PUBLISH_NPM !== "true") {
  console.log(
    `↷ PUBLISH_NPM is not "true", so ${version} was tagged and released on GitHub but not published to npm.`,
  );
  console.log("  Enable it with: gh variable set PUBLISH_NPM --body true");
  process.exit(0);
}

const plugins = readdirSync(join(root, "plugins"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

console.log(`Publishing ${plugins.length} plugins at ${version}…`);

const failed = [];

for (const plugin of plugins) {
  const published = spawnSync(
    "npm",
    ["publish", join("plugins", plugin), "--access", "public", "--provenance"],
    { cwd: root, stdio: "inherit" },
  );
  if (published.status !== 0) failed.push(plugin);
}

if (failed.length > 0) {
  console.error(`✖ npm publish failed for: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(`✔ Published ${plugins.length} plugins at ${version}`);
