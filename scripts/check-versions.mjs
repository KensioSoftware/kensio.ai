#!/usr/bin/env node
// Skills are versioned in lockstep: the root package.json, every plugin's
// package.json, every plugin's plugin.json and the metadata.version in every
// SKILL.md carry the same number, so a given version means the same commit on
// the marketplace, on npm, and in a skill directory someone copied out of a zip.
// The release workflow is what moves them, all at once — nothing here should be
// edited by hand. This check fails the build when any of them drift apart.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readSkill, repoRoot, skills } from "./skills.mjs";

const root = repoRoot;
const pluginsDir = resolve(root, "plugins");

const marketplace = JSON.parse(
  readFileSync(resolve(root, ".claude-plugin/marketplace.json"), "utf8"),
);
const listed = new Set((marketplace.plugins ?? []).map((p) => p.name));
// The website, npm and the marketplace listing all show this string, and the site
// prefers the marketplace entry over the SKILL.md frontmatter, so a drift between
// the three manifests ships as three different descriptions of one skill.
const listedDescriptions = new Map((marketplace.plugins ?? []).map((p) => [p.name, p.description]));

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const problems = [];

const rootVersion = readJson(resolve(root, "package.json")).version;

const found = skills(root);
const dirs = Array.from(new Set(found.map((skill) => skill.plugin)));

for (const skill of found) {
  const { metadata } = readSkill(skill);
  if (metadata.version !== rootVersion) {
    problems.push(
      `${skill.plugin}: SKILL.md metadata.version is ${metadata.version ?? "missing"}, expected ${rootVersion}`,
    );
  }
}

for (const dir of dirs) {
  const pluginJsonPath = resolve(pluginsDir, dir, ".claude-plugin/plugin.json");
  const packageJsonPath = resolve(pluginsDir, dir, "package.json");

  for (const path of [pluginJsonPath, packageJsonPath]) {
    if (!existsSync(path)) problems.push(`${dir}: missing ${path.slice(root.length + 1)}`);
  }
  if (!existsSync(pluginJsonPath) || !existsSync(packageJsonPath)) continue;

  const plugin = readJson(pluginJsonPath);
  const pkg = readJson(packageJsonPath);

  if (plugin.name !== dir) {
    problems.push(`${dir}: plugin.json name is "${plugin.name}", expected "${dir}"`);
  }
  if (pkg.name !== `@kensio/${dir}`) {
    problems.push(`${dir}: package.json name is "${pkg.name}", expected "@kensio/${dir}"`);
  }
  if (plugin.version !== pkg.version) {
    problems.push(
      `${dir}: plugin.json version ${plugin.version} !== package.json version ${pkg.version}`,
    );
  }
  if (plugin.version !== rootVersion) {
    problems.push(
      `${dir}: version ${plugin.version} !== root package.json version ${rootVersion} (versions move in lockstep)`,
    );
  }
  if (!listed.has(dir)) {
    problems.push(`${dir}: not listed in .claude-plugin/marketplace.json`);
  }
  if (plugin.description !== pkg.description) {
    problems.push(`${dir}: plugin.json and package.json descriptions differ`);
  }
  if (listed.has(dir) && listedDescriptions.get(dir) !== plugin.description) {
    problems.push(`${dir}: marketplace.json description differs from plugin.json`);
  }
  console.log(`  ${dir} @ ${plugin.version}`);
}

for (const name of listed) {
  if (!dirs.includes(name)) {
    problems.push(`${name}: listed in marketplace.json but has no plugins/${name} folder`);
  }
}

// The installer carries a copy of every skill, so it is released with them and
// versioned with them. It is not a plugin and has no marketplace entry.
const cli = readJson(resolve(root, "packages/skills-cli/package.json"));
if (cli.version !== rootVersion) {
  problems.push(
    `skills-cli: version ${cli.version} !== root package.json version ${rootVersion} (versions move in lockstep)`,
  );
}
if (cli.name !== "@kensio/skills") {
  problems.push(`skills-cli: package.json name is "${cli.name}", expected "@kensio/skills"`);
}
console.log(`  skills-cli @ ${cli.version}`);

if (problems.length > 0) {
  console.error("\n✖ Version / naming / description check failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`\n✔ Versions, names and descriptions are consistent, all at ${rootVersion}`);
