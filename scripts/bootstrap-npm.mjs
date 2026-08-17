#!/usr/bin/env node
// Publishes the first version of any package the registry has never seen.
//
// npm trusted publishing cannot create a package, because a trusted publisher is
// configured against a package that already exists. So the first version of
// every package goes up by hand, from a machine with an npm login, and only then
// can the release workflow take over. This does the mechanical part of that.
//
//   node scripts/bootstrap-npm.mjs            # report what would happen
//   node scripts/bootstrap-npm.mjs --publish  # do it
//
// It refuses to run against a working tree that does not match a release, which
// is the mistake the manual instructions were always one step away from:
// semantic-release tags the commit before it writes the version out, so a clean
// checkout of a tag still carries the previous number, and publishing straight
// from it puts the wrong version on npm.
//
// It does not configure the trusted publishers. That is a form on npmjs.com with
// no API behind it, and it prints the values to enter.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publishablePackages, repoRoot } from "./skills.mjs";

const publish = process.argv.includes("--publish");
const root = repoRoot;

const run = (command, args, options = {}) =>
  spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });

const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

const rootVersion = readJson("package.json").version;

/** Whether a package exists on the registry, telling a 404 from a bad day. */
function isPublished(name) {
  const view = run("npm", ["view", name, "name"]);
  if (view.status === 0) return true;
  if (/E404|404 Not Found|is not in this registry/i.test(view.stderr ?? "")) return false;

  console.error(`✖ Could not ask npm about ${name}, and a guess here publishes the wrong thing.`);
  console.error((view.stderr ?? "").trim());
  process.exit(1);
}

// A dirty tree means the thing about to be packed is not the thing that was
// checked, and `npm publish` packs the working directory rather than the commit.
const status = run("git", ["status", "--porcelain"]);
if ((status.stdout ?? "").trim() !== "") {
  console.error("✖ The working tree has uncommitted changes. npm publish packs those.");
  process.exit(1);
}

// The version has to be one that exists as a release, because everything
// downstream (the marketplace, the zips, the site) is keyed on the tag.
const tagged = run("git", ["tag", "--points-at", "HEAD"]);
const tags = (tagged.stdout ?? "")
  .split("\n")
  .map((tag) => tag.trim())
  .filter(Boolean);
if (!tags.includes(`v${rootVersion}`)) {
  console.error(`✖ HEAD is not tagged v${rootVersion}, so this is not a released commit.`);
  console.error("  Check out the release tag, run scripts/set-version.mjs for it, and retry.");
  console.error(`  Tags here: ${tags.length > 0 ? tags.join(", ") : "none"}`);
  process.exit(1);
}

const whoami = run("npm", ["whoami"]);
if (whoami.status !== 0) {
  console.error("✖ Not logged in to npm. Run `npm login` first, then retry.");
  process.exit(1);
}
console.log(`npm user: ${(whoami.stdout ?? "").trim()}`);

// The installer publishes a generated copy of every skill, and an empty one is
// a working install of nothing at all.
const bundled = run("node", ["scripts/bundle-skills.mjs"], { stdio: "inherit" });
if (bundled.status !== 0) {
  console.error("✖ Could not bundle the skills into @kensio/skills.");
  process.exit(1);
}

const packages = publishablePackages(root).map((dir) => ({
  dir,
  ...readJson(join(dir, "package.json")),
}));

for (const pkg of packages) {
  if (pkg.version !== rootVersion) {
    console.error(`✖ ${pkg.dir} is at ${pkg.version}, and the repository is at ${rootVersion}.`);
    process.exit(1);
  }
}

const missing = packages.filter((pkg) => !isPublished(pkg.name));

if (missing.length === 0) {
  console.log(`\n✔ All ${packages.length} packages are on npm. Releases publish them from now on.`);
  process.exit(0);
}

console.log(`\n${missing.length} package(s) have never been published:`);
for (const pkg of missing) console.log(`    ${pkg.name}  (${pkg.dir})`);

if (!publish) {
  console.log("\nThis was a report. Pass --publish to send these to npm.");
  console.log("A first version carries no provenance attestation, because provenance is minted");
  console.log("from the workflow's OIDC token and there is no workflow involved here.");
  process.exit(0);
}

const failed = [];

for (const pkg of missing) {
  console.log(`\nPublishing ${pkg.name} at ${rootVersion}…`);
  // "./" is load-bearing: npm reads a bare "plugins/<name>" as the GitHub
  // shorthand owner/repo and tries to clone it.
  const published = run("npm", ["publish", `./${pkg.dir}`, "--access", "public"], {
    stdio: "inherit",
    encoding: undefined,
  });
  if (published.status !== 0) failed.push(pkg.name);
}

const published = missing.filter((pkg) => !failed.includes(pkg.name));

if (published.length > 0) {
  console.log(`\n✔ Published ${published.length} package(s) at ${rootVersion}.`);
  console.log("\nEach one now needs a trusted publisher, or the next release cannot publish it.");
  console.log("On npmjs.com, under Settings, Trusted Publisher:\n");
  console.log("    Publisher    GitHub Actions");
  console.log("    Owner        KensioSoftware");
  console.log("    Repository   kensio.ai");
  console.log("    Workflow     release.yml");
  console.log("    Environment  release\n");
  for (const pkg of published) {
    console.log(`    https://www.npmjs.com/package/${pkg.name}/access`);
  }
}

if (failed.length > 0) {
  console.error(`\n✖ npm publish failed for: ${failed.join(", ")}`);
  process.exit(1);
}
