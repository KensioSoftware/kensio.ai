---
name: skill-template
description: Scaffold a new Claude Code skill in this repo — creates the plugin folder, package.json, plugin.json and SKILL.md, and registers it in the marketplace. Use when the user asks to "add a new skill", "create a skill", or "start a new plugin" in the kensio.ai repo.
---

# Skill Template

A starting point for adding a new skill to this repo. Copy the structure below,
replace the placeholders, then run the validation scripts.

## Layout

Every skill lives in its own self-contained plugin folder:

```
plugins/<skill-name>/
├── package.json                        # npm package: @kensio/<skill-name>
├── .claude-plugin/
│   └── plugin.json                     # name, version, description, author
└── skills/
    └── <skill-name>/
        └── SKILL.md
```

**A plugin folder must be self-contained.** Never reference files outside it
with `../` — plugins are copied, zipped, and installed standalone, so those
paths will not resolve.

## Steps

1. Create `plugins/<skill-name>/` following the layout above.
2. Copy `package.json` from an existing plugin; set `name` to
   `@kensio/<skill-name>`, `version` to `1.0.0`, and the `repository.directory`
   to `plugins/<skill-name>`.
3. Copy `.claude-plugin/plugin.json`; set `name`, `description` and `version`.
   Keep the version identical to `package.json` — `npm run check:versions`
   enforces this.
4. Write `skills/<skill-name>/SKILL.md` (see frontmatter below).
5. Add an entry to `.claude-plugin/marketplace.json` with a matching `name`, a
   `source` of `"./plugins/<skill-name>"`, and a description.
6. Run `npm run validate` and `npm run check:versions`.

## SKILL.md frontmatter

```markdown
---
name: <skill-name>
description: <what it does, then when to use it — include the words and phrases a user would actually type>
---
```

- `name` must be kebab-case and match the containing directory.
- `description` is the _only_ thing Claude sees when deciding whether to load
  the skill, so it carries the whole triggering burden. State what the skill
  does, then when to use it, in third person. Concrete trigger phrases beat
  abstract summaries.
- Optional frontmatter worth knowing: `allowed-tools` (restrict the tools the
  skill may use) and `disable-model-invocation: true` (user-invocable only, via
  `/<skill-name>`).

## Writing the body

Keep `SKILL.md` short and imperative — it is instructions for Claude, not
documentation for a human. Push detail into sibling files (`reference.md`,
`examples/`) and link to them, so the body stays cheap to load and the details
are read only when needed.

## Releasing

Claude Code only detects an update when the `version` string in `plugin.json`
changes, so bump it on every release, in step with `package.json`.

```bash
npm version patch --workspace @kensio/<skill-name>
```

Then mirror that version into `plugin.json`, commit, and tag:

```bash
claude plugin tag plugins/<skill-name> --push
```
