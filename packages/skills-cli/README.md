# @kensio/skills

Installs [Kensio](https://kensio.ai) agent skills into any agent that reads `SKILL.md`.

```bash
npx @kensio/skills list
npx @kensio/skills add technical-prose-style
```

The package carries every published skill inside it, so `add` copies a directory and touches the
network only once, when npx fetches the package.

## Where it puts them

The default is `.agents/skills/` in the current directory. That is the cross-tool convention, read
by Codex CLI, VS Code, Cursor, Gemini CLI and the other implementations of the
[Agent Skills specification](https://agentskills.io/specification), so one copy serves whichever of
them a project uses.

```bash
npx @kensio/skills add isolated-testing-style --agent claude   # .claude/skills/
npx @kensio/skills add isolated-testing-style --agent copilot  # .github/skills/
npx @kensio/skills add isolated-testing-style --user           # under your home directory
npx @kensio/skills add --all --to ./vendor/skills              # anywhere you like
```

`--force` replaces a skill directory that is already there. Without it, an existing directory is
left alone and reported.

## What gets installed

A skill directory, holding its `SKILL.md` and whatever reference files and scripts it needs. An
agent loads it from the `description` in the frontmatter when a task matches. There is no command to
run and no name to invoke.

The skills are listed at [kensio.ai/skills](https://kensio.ai/skills), and each one has a page
covering what it does and when it fires.

## The other ways in

Claude Code takes the same skills as plugins, from a marketplace that keeps them updatable in place.
Each skill is published as its own npm package for pinning in a lockfile. Every
[release](https://github.com/KensioSoftware/kensio.ai/releases) carries zips for a machine with
neither. See [kensio.ai/docs](https://kensio.ai/docs).

Part of [kensio.ai](https://github.com/KensioSoftware/kensio.ai). Licensed under the Apache License
2.0. See the [LICENSE](https://github.com/KensioSoftware/kensio.ai/blob/main/LICENSE) in the
repository root.
