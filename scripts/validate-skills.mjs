#!/usr/bin/env node
// Validates each skill against the Agent Skills specification, and against the
// one rule the specification cannot check: that a skill directory works when it
// is the only thing that got copied.
//
// `claude plugin validate` (scripts/validate.mjs) checks the Claude Code wrapper
// around a skill. It has nothing to say about a SKILL.md that tells an agent to
// run `node skills/<name>/scripts/thing.mjs`, which is correct in this
// repository and wrong in every install of it. That shipped once. This is the
// check that would have caught it.
//
// Spec: https://agentskills.io/specification

import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { readSkill, repoRoot, skills } from "./skills.mjs";

/** Every frontmatter key the specification defines. */
const SPEC_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

/**
 * Vendor keys carried on purpose, and what they cost.
 *
 * The specification says anything outside its own list fails validation, so a
 * strict reader elsewhere may refuse a skill that carries one of these. That is
 * the trade being made each time a name goes in here, and it needs a reason
 * worth more than the portability.
 *
 * `disable-model-invocation` is Claude Code's, and it stops a skill loading on
 * its own. `pangram-check` bills the user per run, so the skill firing by itself
 * costs money. A skill that fails to load under a strict validator is the
 * cheaper failure.
 */
const VENDOR_KEYS = new Map([["disable-model-invocation", new Set(["pangram-check"])]]);

/**
 * Skills allowed to name this repository's layout in their bodies.
 *
 * Only one thing legitimately does: the template, whose subject *is* how a skill
 * gets published from here. Every other skill is instructions for a task, and a
 * `plugins/…` path in one of those is a path that resolves nowhere once the
 * skill has been installed.
 */
const REPO_LAYOUT_ALLOWED = new Set(["skill-template"]);

/** Directories the specification names, which a body may reference by path. */
const SKILL_SUBDIRECTORIES = /^(references|scripts|assets)\//;

/**
 * Path-shaped tokens: two or more segments and a file extension.
 *
 * Deliberately narrow. `path/to/file.md` in an example command is a placeholder
 * and not a claim that the file exists, so only the specification's own
 * directories are followed up.
 */
const PATH_TOKEN = /(?<![\w./-])((?:\.\.?\/)?[\w.-]+(?:\/[\w.-]+)+\.[a-z0-9]{1,6})\b/g;

const MARKDOWN_LINK = /\]\(([^)\s]+)\)/g;

const problems = [];
const found = skills(repoRoot);

for (const skill of found) {
  const where = relative(repoRoot, skill.skillFile);
  const fail = (message) => problems.push(`${where}: ${message}`);

  if (!existsSync(skill.skillFile)) {
    fail("no SKILL.md in the skill directory");
    continue;
  }

  const { raw, fields, metadata, body } = readSkill(skill);

  if (raw === "") {
    fail("no YAML frontmatter block");
    continue;
  }

  for (const key of Object.keys(fields)) {
    if (SPEC_KEYS.has(key)) continue;
    if (VENDOR_KEYS.get(key)?.has(skill.name)) {
      console.warn(
        `  ! ${where} carries "${key}", which is outside the specification. A strict reader may refuse the skill.`,
      );
      continue;
    }
    fail(`frontmatter key "${key}" is not in the specification`);
  }

  const name = fields.name ?? "";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    fail(
      `name "${name}" must be lowercase alphanumeric and hyphenated, with no leading, trailing or doubled hyphen`,
    );
  }
  if (name.length > 64)
    fail(`name is ${name.length} characters, over the 64 the specification allows`);
  if (name !== skill.name) fail(`name "${name}" does not match its directory "${skill.name}"`);

  const description = fields.description ?? "";
  if (description.trim() === "") fail("description is empty");
  if (description.length > 1024) {
    fail(`description is ${description.length} characters, over the 1024 the specification allows`);
  }

  if ((fields.compatibility ?? "").length > 500) fail("compatibility is over 500 characters");

  // Local rules on top of the specification. Both exist so that a directory
  // lifted out of a zip carries what a reader needs to know about it.
  if (fields.license !== "Apache-2.0") fail('license must be "Apache-2.0"');
  if (!/^\d+\.\d+\.\d+/.test(metadata.version ?? "")) {
    fail(`metadata.version is ${metadata.version ?? "missing"}, expected a release version`);
  }

  const bodyLines = body.split("\n").length;
  if (bodyLines > 500) {
    console.warn(
      `  ! ${where} is ${bodyLines} lines. The specification suggests keeping SKILL.md under 500 and moving detail into references/.`,
    );
  }

  // Links first: a relative one names a file that has to be there.
  for (const [, target] of body.matchAll(MARKDOWN_LINK)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(target)) continue;
    const file = join(skill.dir, target.split("#")[0]);
    if (!existsSync(file)) fail(`links to ${target}, which is not in the skill directory`);
  }

  // Then paths anywhere in the file, including inside code fences, which is
  // where a command an agent is told to run actually lives. A skill that
  // documents the repository is talking about paths in it throughout, and
  // nothing here can tell those from a mistake.
  if (!REPO_LAYOUT_ALLOWED.has(skill.name)) {
    for (const [, token] of body.matchAll(PATH_TOKEN)) {
      if (token.startsWith("../") || token.includes("/../")) {
        fail(`references ${token}, which points outside the skill directory`);
        continue;
      }

      if (/(^|\/)(plugins|skills)\//.test(token)) {
        fail(
          `references ${token}, a path in this repository rather than one relative to the skill`,
        );
        continue;
      }

      const target = token.replace(/^\.\//, "");
      if (SKILL_SUBDIRECTORIES.test(target) && !existsSync(join(skill.dir, target))) {
        fail(`references ${token}, which is not in the skill directory`);
      }
    }
  }

  console.log(`  ${skill.name} @ ${metadata.version}`);
}

if (found.length === 0) problems.push("no skills found under plugins/*/skills/*");

if (problems.length > 0) {
  console.error("\n✖ Agent Skills validation failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`\n✔ ${found.length} skills valid against the Agent Skills specification`);
