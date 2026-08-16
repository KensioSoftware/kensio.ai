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
//
// The directories are passed as "./plugins/<name>". The "./" is load-bearing:
// npm parses a bare "plugins/<name>" as the GitHub shorthand owner/repo and
// tries to clone github.com/plugins/<name>.git.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
// Exercising this script should never be able to touch the registry by accident.
const dryRun = process.argv.includes("--dry-run");
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

// Trusted publishing cannot create a package that does not exist yet, because a
// trusted publisher is configured against a package that is already on npm. The
// first version of a new plugin is therefore published by hand, and the registry
// answers a 404 until that happens. Detecting it up front separates "this plugin
// has never been released" from a real publish failure, so one new plugin does
// not abort a release that the other plugins completed.
const packageName = (plugin) =>
  JSON.parse(readFileSync(join(root, "plugins", plugin, "package.json"), "utf8")).name;

const onNpm = (name) => spawnSync("npm", ["view", name, "name"], { encoding: "utf8" }).status === 0;

const needBootstrap = plugins.filter((plugin) => !onNpm(packageName(plugin)));
const publishable = plugins.filter((plugin) => !needBootstrap.includes(plugin));

console.log(`Publishing ${publishable.length} plugins at ${version}${dryRun ? " (dry run)" : ""}…`);

const failed = [];

for (const plugin of publishable) {
  const published = spawnSync(
    "npm",
    [
      "publish",
      `./plugins/${plugin}`,
      "--access",
      "public",
      ...(dryRun ? ["--dry-run"] : ["--provenance"]),
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (published.status !== 0) failed.push(plugin);
}

if (failed.length === 0) {
  console.log(`✔ Published ${publishable.length} plugins at ${version}`);
}

if (needBootstrap.length > 0) {
  console.log("");
  console.log(
    `⚠ Never published, so ${needBootstrap.length} plugin(s) need a manual first release:`,
  );
  for (const plugin of needBootstrap) console.log(`    ${packageName(plugin)}`);
  console.log("");
  console.log("  Run these from a clean checkout, then add a trusted publisher for each package");
  console.log("  under Settings, Trusted Publisher on npmjs.com. See the README.");
  console.log("");
  console.log(`    git checkout v${version}`);
  console.log(`    node scripts/set-version.mjs ${version}`);
  for (const plugin of needBootstrap) {
    console.log(`    npm publish ./plugins/${plugin} --access public`);
  }
  console.log("");
  console.log("  set-version is the step that is easy to miss. semantic-release tags the commit");
  console.log("  before it writes the version out, so the manifests at the tag still carry the");
  console.log("  previous number.");
}

// Reported after the bootstrap notice, so a real failure never hides the one
// instruction that would fix a brand new plugin.
if (failed.length > 0) {
  console.error(`✖ npm publish failed for: ${failed.join(", ")}`);
  process.exit(1);
}
