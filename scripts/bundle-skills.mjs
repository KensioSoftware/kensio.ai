#!/usr/bin/env node
// Copies every skill directory into the installer package.
//
// `@kensio/skills` ships the skills inside itself so that `npx @kensio/skills
// add <name>` needs nothing but the registry. The copies are generated, never
// committed, and rebuilt on every pack, so they cannot drift from the plugins
// they came from.
//
// Runs from the package's `prepack`, and again from publish-npm.mjs before the
// publish, because a lifecycle script is a thin thing to hang a release on.

import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { repoRoot, skills } from "./skills.mjs";

const destination = join(repoRoot, "packages", "skills-cli", "skills");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

const found = skills(repoRoot);

for (const skill of found) {
  await cp(skill.dir, join(destination, skill.name), { recursive: true });
  console.log(`  ${skill.name}`);
}

console.log(`✔ bundled ${found.length} skills into packages/skills-cli/skills`);
