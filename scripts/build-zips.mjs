#!/usr/bin/env node
// Builds one zip per skill, plus one holding all of them.
//
// This is the distribution for a machine with neither git nor npm reach: an
// air-gapped host, a CI image, a locked-down client environment. The zip holds
// the skill directory at its root, so unzipping it into `.agents/skills/` puts
// the skill exactly where an agent looks and needs no rearranging afterwards.
//
// Attached to the GitHub release by .releaserc.json.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { readSkill, repoRoot, skills } from "./skills.mjs";

const version = process.argv[2] ?? readSkill(skills(repoRoot)[0]).metadata.version;

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "")) {
  console.error(`Usage: build-zips.mjs <version>   (got ${version ?? "nothing"})`);
  process.exit(1);
}

const outputDir = join(repoRoot, "dist");
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

// `zip` rather than a library: it is on every runner and on every developer
// machine this repository is worked on, and a dependency that writes archive
// headers is a strange thing to add for seven directories.
const zip = (cwd, archive, entries) => {
  const result = spawnSync("zip", ["--quiet", "--recurse-paths", archive, ...entries], { cwd });
  if (result.error?.code === "ENOENT") {
    console.error("Could not run `zip`. Install it, or build the archives by hand.");
    process.exit(127);
  }
  if (result.status !== 0) {
    console.error(`✖ zip failed for ${archive}`);
    process.exit(1);
  }
};

const found = skills(repoRoot);

for (const skill of found) {
  const archive = join(outputDir, `${skill.name}-${version}.zip`);
  zip(dirname(skill.dir), archive, [skill.name]);
  console.log(`  ${skill.name}-${version}.zip`);
}

// The set as one download. Same layout, so the same unzip command installs all
// of them at once.
const stagingDir = join(outputDir, "kensio-skills");
mkdirSync(stagingDir, { recursive: true });
for (const skill of found) {
  spawnSync("cp", ["-R", skill.dir, join(stagingDir, skill.name)]);
}
zip(stagingDir, join(outputDir, `kensio-skills-${version}.zip`), ["."]);
rmSync(stagingDir, { recursive: true, force: true });
console.log(`  kensio-skills-${version}.zip`);

console.log(`\n✔ ${found.length + 1} archives in dist/`);
