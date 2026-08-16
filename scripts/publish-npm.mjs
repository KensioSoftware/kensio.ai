#!/usr/bin/env node
// Publishes every workspace to npm at the version semantic-release just set.
//
// Gated on the PUBLISH_NPM repository variable so the release workflow can be
// merged, tagged and exercised before anything becomes permanent on npm. Set the
// variable to "true" once the packages are ready to exist publicly:
//
//   gh variable set PUBLISH_NPM --body true
//
// Authentication is npm trusted publishing (OIDC): the workflow holds no npm
// token, and npm mints a short-lived one from the id-token the job requests.

import { spawnSync } from "node:child_process";

const version = process.argv[2];

if (process.env.PUBLISH_NPM !== "true") {
  console.log(
    `↷ PUBLISH_NPM is not "true", so ${version} was tagged and released on GitHub but not published to npm.`,
  );
  console.log("  Enable it with: gh variable set PUBLISH_NPM --body true");
  process.exit(0);
}

console.log(`Publishing all workspaces at ${version}…`);

const published = spawnSync(
  "npm",
  ["publish", "--workspaces", "--access", "public", "--provenance"],
  { stdio: "inherit" },
);

if (published.status !== 0) {
  console.error(`✖ npm publish failed for ${version}`);
  process.exit(published.status ?? 1);
}

console.log(`✔ Published all workspaces at ${version}`);
