---
name: skill-template
description: Scaffold a new agent skill, writing the SKILL.md and its frontmatter to the Agent Skills specification, then wrapping it as a plugin in this repo with package.json, plugin.json and a marketplace entry. Use when the user asks to "add a new skill", "create a skill", "write a SKILL.md" or "start a new plugin", and when checking whether an existing skill is portable between agents.
license: Apache-2.0
metadata:
  version: "1.16.0"
---

# Skill template

A skill is a directory with a `SKILL.md` in it. That directory is the artefact, and every agent
reads it. The plugin folder around it in this repository is packaging for one of them.

Write the skill first, following the [specification](https://agentskills.io/specification). Then
wrap it.

## The skill directory

```
<skill-name>/
├── SKILL.md
├── references/                 # optional, loaded only when linked to
├── scripts/                    # optional, anything the skill runs
└── assets/                     # optional, templates and data files
```

Those three subdirectory names come from the specification. An agent that supports skills at all
knows this shape, whether it reads the directory from `.agents/skills/`, `.claude/skills/`,
`.github/skills/` or a plugin.

**Every path a skill mentions is relative to its own directory.** The directory gets copied out on
its own, unzipped somewhere unrelated, and installed under a name this repository never sees. A
command written as `node skills/<skill-name>/scripts/check.mjs` works here and nowhere else. Write
`node scripts/check.mjs`. `pnpm validate:skills` fails the build on any path that reaches outside
the skill, which is the check that caught this after it had already shipped once.

## Frontmatter

```markdown
---
name: <skill-name>
description: <what it does, then when to use it. Include the words and phrases a user would actually type>
license: Apache-2.0
metadata:
  version: "0.0.0"
---
```

- `name` is lowercase, hyphenated, at most 64 characters, and matches the containing directory.
- `description` is the _only_ thing an agent sees when deciding whether to load the skill. It
  carries the whole triggering burden. State what the skill does, then when to use it, in third
  person. Concrete trigger phrases beat abstract summaries. 1024 characters is the ceiling.
- `license` and `metadata` travel with the directory. A copy in someone's `.agents/skills/` has no
  package.json beside it, and these are then the only record of what it is and where it came from.
  The release sets `metadata.version`. Never edit that number by hand.
- The specification allows two more keys. `compatibility` states an environment requirement, such as
  a binary the scripts need. `allowed-tools` restricts the tools the skill may use, and support for
  it varies between agents. Any other key fails validation.

Keep `SKILL.md` under 500 lines. It is instructions for an agent, and documentation for a human
belongs in the README. Push detail into `references/` and link to it. The body stays cheap to load
and the details are read only when needed.

## Wrapping it as a plugin

Claude Code installs skills as plugins, so each one here has a plugin folder around it:

```
plugins/<skill-name>/
├── package.json                # npm package: @kensio/<skill-name>
├── README.md                   # for humans arriving from npm or GitHub
├── .claude-plugin/
│   └── plugin.json             # name, version, description, author
└── skills/
    └── <skill-name>/           # the skill directory above
```

1. Create `plugins/<skill-name>/` following that layout.
2. Copy `package.json` from an existing plugin, then set `name` to `@kensio/<skill-name>` and
   `repository.directory` to `plugins/<skill-name>`.
3. Copy `.claude-plugin/plugin.json`, then set `name` and `description`.
4. Set the `version` in both files, and in the `SKILL.md` frontmatter, to whatever the other plugins
   currently carry. Versions move in lockstep across the whole repo and the release workflow is what
   changes them. Never pick a new number by hand.
5. Write `skills/<skill-name>/SKILL.md`.
6. Add an entry to `.claude-plugin/marketplace.json` with a matching `name`, a `source` of
   `"./plugins/<skill-name>"`, and a description.
7. Run `pnpm check`.

Anything under `skills/` ships, because that is what `package.json` lists in `files`. A script the
skill runs belongs there too, and never at the plugin root.

**A plugin folder must be self-contained.** Never reference files outside it with `../`. Plugins are
copied, zipped and installed standalone, and those paths will not resolve.

Nothing else needs telling about the new folder. `scripts/set-version.mjs`,
`scripts/publish-npm.mjs` and `scripts/build-zips.mjs` all read the `plugins/` directory, so a new
skill is versioned, bundled into `@kensio/skills`, zipped onto the release and published without
being listed anywhere else.

**A brand new package still needs one manual first publish.** npm trusted publishing cannot create a
package that does not exist, because the trusted publisher is configured against a package already
on the registry. The release reports the commands and carries on. See "npm publishing" in the
repository README.

## Prose

`pnpm check` runs `pnpm prose`, which fails the build on em dashes, semicolons, and five sentence
shapes measured against Django, Effective Go, the Rust Book and the Python docs. A new `SKILL.md`
and `README.md` have to pass it.

Load the `technical-prose-style` skill before writing either one. It carries the rules, the
before-and-after examples, and the evidence for each. Checking a single file while drafting:

```bash
node plugins/technical-prose-style/skills/technical-prose-style/scripts/prose-check.mjs plugins/<skill-name>
```

## Releasing

Releasing is automatic. Merging to `main` releases, and the version comes from the pull request
title. `fix:` for a patch, `feat:` for a minor, `feat!:` or a `BREAKING CHANGE` footer for a major.
A `docs:` or `chore:` title releases nothing.

Every plugin is set to the new version together. A released version means the same commit wherever
it was installed from.
