#!/usr/bin/env node
// Each skill is published twice — as an npm package and as a marketplace plugin —
// from two manifests that each carry their own version string. Claude Code only
// notices an update when plugin.json's version changes, so the two must be bumped
// together. This check fails the build when they drift apart.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginsDir = resolve(root, 'plugins');

const marketplace = JSON.parse(
  readFileSync(resolve(root, '.claude-plugin/marketplace.json'), 'utf8'),
);
const listed = new Set((marketplace.plugins ?? []).map((p) => p.name));

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const problems = [];

const dirs = readdirSync(pluginsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const dir of dirs) {
  const pluginJsonPath = resolve(pluginsDir, dir, '.claude-plugin/plugin.json');
  const packageJsonPath = resolve(pluginsDir, dir, 'package.json');

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
  if (!listed.has(dir)) {
    problems.push(`${dir}: not listed in .claude-plugin/marketplace.json`);
  }
  console.log(`  ${dir} @ ${plugin.version}`);
}

for (const name of listed) {
  if (!dirs.includes(name)) {
    problems.push(`${name}: listed in marketplace.json but has no plugins/${name} folder`);
  }
}

if (problems.length > 0) {
  console.error('\n✖ Version / naming check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('\n✔ Versions and names are consistent');
