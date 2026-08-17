#!/usr/bin/env node
// Writes one version into every manifest in the repo.
//
// Skills are versioned in lockstep: the root package.json, each plugin's
// package.json, each plugin's plugin.json and the `metadata.version` in each
// SKILL.md all carry the same number. That makes "everything at 1.4.0 came from
// one commit" true across the marketplace and npm, at the cost of republishing
// plugins that did not change.
//
// SKILL.md carries the version because a skill directory travels on its own. A
// copy sitting in someone's `.agents/skills/` has no package.json beside it, and
// the number in the frontmatter is then the only way to tell what it is.
//
// semantic-release calls this from its prepare step; run it by hand only if you
// are repairing a release.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { repoRoot, skills } from "./skills.mjs";

const version = process.argv[2];

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "")) {
  console.error(`Usage: set-version.mjs <version>   (got ${version ?? "nothing"})`);
  process.exit(1);
}

const root = repoRoot;
const pluginsDir = resolve(root, "plugins");

const setVersion = (path) => {
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  return relative(root, path);
};

// `metadata.version` in the frontmatter, left alone everywhere else. The body of
// a SKILL.md is prose, and a blunt replace would rewrite any version number a
// skill happens to quote.
const setSkillVersion = (path) => {
  const source = readFileSync(path, "utf8");
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(source);
  if (!frontmatter) {
    console.error(`✖ ${relative(root, path)} has no frontmatter block`);
    process.exit(1);
  }

  const replaced = frontmatter[0].replace(/^(\s+version:\s*).*$/m, `$1"${version}"`);
  if (replaced === frontmatter[0]) {
    console.error(`✖ ${relative(root, path)} has no metadata.version to set`);
    process.exit(1);
  }

  writeFileSync(path, replaced + source.slice(frontmatter[0].length));
  return relative(root, path);
};

const written = [resolve(root, "package.json"), resolve(root, "packages/skills-cli/package.json")];

for (const plugin of new Set(skills(root).map((skill) => skill.plugin))) {
  written.push(
    resolve(pluginsDir, plugin, "package.json"),
    resolve(pluginsDir, plugin, ".claude-plugin/plugin.json"),
  );
}

for (const path of written) console.log(`  ${setVersion(path)} → ${version}`);
for (const skill of skills(root)) console.log(`  ${setSkillVersion(skill.skillFile)} → ${version}`);

// Re-format so the release commit cannot drift from what format:check expects.
// The SKILL.md files are left out: only a quoted value inside the frontmatter
// changed, and that cannot affect how the Markdown below it is wrapped.
const formatted = spawnSync("npx", ["oxfmt", ...written], { stdio: "inherit" });
if (formatted.status !== 0) {
  console.error("✖ oxfmt failed on the version-bumped manifests");
  process.exit(1);
}

console.log(`\n✔ ${written.length + skills(root).length} manifests set to ${version}`);
