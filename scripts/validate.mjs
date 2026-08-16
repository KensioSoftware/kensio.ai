#!/usr/bin/env node
// Validates the marketplace manifest and every plugin it points at.
//
// `claude plugin validate .` only checks the marketplace manifest itself, so we
// walk the relative-path sources and validate each plugin folder too. That also
// catches a marketplace entry pointing at a folder that does not exist.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marketplacePath = resolve(root, '.claude-plugin/marketplace.json');

function validate(target) {
  const result = spawnSync('claude', ['plugin', 'validate', target, '--strict'], {
    stdio: 'inherit',
  });
  if (result.error?.code === 'ENOENT') {
    console.error(
      'Could not run `claude`. Install it with: npm install -g @anthropic-ai/claude-code',
    );
    process.exit(127);
  }
  return result.status === 0;
}

let ok = validate(root);

const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'));

for (const plugin of marketplace.plugins ?? []) {
  const { name, source } = plugin;

  if (typeof source !== 'string') {
    console.log(`↷ ${name}: non-path source, nothing to validate locally`);
    continue;
  }

  const pluginDir = resolve(root, source);
  if (!existsSync(resolve(pluginDir, '.claude-plugin/plugin.json'))) {
    console.error(`✖ ${name}: no plugin.json at ${source}`);
    ok = false;
    continue;
  }

  ok = validate(pluginDir) && ok;
}

process.exit(ok ? 0 : 1);
