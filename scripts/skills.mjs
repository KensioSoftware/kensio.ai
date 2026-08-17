// Where the skills are and what is in them, for every other script here.
//
// A plugin folder is the Claude Code wrapper. The portable artefact is the
// directory under `skills/`, which is what the zips, the npm packages and the
// installer all copy, and what the Agent Skills specification describes. Both
// shapes are needed often enough that finding them belongs in one place.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const directoriesIn = (path) =>
  readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/** Plugin folder names, i.e. the directories under `plugins/`. */
export function pluginNames(root = repoRoot) {
  return directoriesIn(join(root, "plugins"));
}

/**
 * Every skill in the repository, as `{ plugin, name, dir, skillFile }`.
 *
 * A plugin may hold more than one skill. None does today, and nothing here
 * assumes otherwise.
 */
export function skills(root = repoRoot) {
  const found = [];
  for (const plugin of pluginNames(root)) {
    const skillsDir = join(root, "plugins", plugin, "skills");
    for (const name of directoriesIn(skillsDir)) {
      found.push({
        plugin,
        name,
        dir: join(skillsDir, name),
        skillFile: join(skillsDir, name, "SKILL.md"),
      });
    }
  }
  return found;
}

/**
 * Split a `SKILL.md` into its frontmatter block and its body.
 *
 * The frontmatter is YAML, and this is not a YAML parser. It reads the flat
 * `key: value` lines and the one nested block the specification defines
 * (`metadata`), which is the whole of what a `SKILL.md` is allowed to carry.
 * Anything deeper is a validation failure rather than something to parse.
 */
export function splitFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { raw: "", fields: {}, metadata: {}, body: source };

  const fields = {};
  const metadata = {};
  let inMetadata = false;

  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const indented = /^\s/.test(line);
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = unquote(line.slice(separator + 1).trim());

    if (indented) {
      if (inMetadata) metadata[key] = value;
      continue;
    }

    inMetadata = key === "metadata";
    fields[key] = value;
  }

  return { raw: match[1], fields, metadata, body: source.slice(match[0].length) };
}

function unquote(value) {
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return quoted && value.length > 1 ? value.slice(1, -1) : value;
}

/** Read and split a skill's `SKILL.md`. */
export function readSkill(skill) {
  return splitFrontmatter(readFileSync(skill.skillFile, "utf8"));
}
