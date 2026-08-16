# kensio.ai

[https://kensio.ai](https://kensio.ai "Kensio AI Skills & Tooling")

Claude Code skills from [Kensio Software](https://kensiosoftware.co.uk) —
reusable, opinionated ways of working, packaged as installable plugins.

This repository is the canonical source. Each skill is a self-contained plugin
that can be installed from the Claude Code marketplace, from npm, or (later) as
a downloadable archive.

The first three real skills are a set: `isolated-testing-style` is a way of
writing tests, and `yulin-aws-simulation` and `part-factory-test-data` cover two
Kensio packages that serve it. `hello-world` and `skill-template` remain as
examples that validate the structure end to end.

## Install

### From the marketplace (recommended)

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
```

Then install the skills you want:

```bash
claude plugin install hello-world@kensio
```

The same commands work as slash commands inside a Claude Code session:

```
/plugin marketplace add KensioSoftware/kensio.ai
/plugin install hello-world@kensio
```

Claude Code only notices an update when a plugin's `version` changes, so pick up
new releases with:

```bash
claude plugin update hello-world@kensio
```

### From npm

Every skill is also published as an independently versioned scoped package:

```bash
npm install @kensio/hello-world
```

The package contains the plugin folder as-is (`.claude-plugin/` plus `skills/`),
so point Claude Code at it — or at `node_modules/@kensio/<skill-name>` — as a
local plugin.

### From an archive

Zips of each plugin will be published on kensio.ai for machines that have
neither git nor npm access (air-gapped hosts, CI images, locked-down client
environments). Not available yet.

## Available skills

| Skill                                                      | npm                              | What it does                                                                                    |
| ---------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`isolated-testing-style`](plugins/isolated-testing-style) | `@kensio/isolated-testing-style` | Real collaborators through simulation, isolation from randomised data, assertions on behaviour. |
| [`yulin-aws-simulation`](plugins/yulin-aws-simulation)     | `@kensio/yulin-aws-simulation`   | Testing AWS code with the [Yulin](https://yulinsim.dev/) in-process simulator.                  |
| [`part-factory-test-data`](plugins/part-factory-test-data) | `@kensio/part-factory-test-data` | Building test data with [Part Factory](https://partfactory.dev/).                               |
| [`hello-world`](plugins/hello-world)                       | `@kensio/hello-world`            | Minimal example that confirms the install path works.                                           |
| [`skill-template`](plugins/skill-template)                 | `@kensio/skill-template`         | Copy-and-edit starting point for writing a new skill.                                           |

The first three are meant to be read together. `isolated-testing-style` is the
philosophy, and the other two are tools that serve it.

## Repository layout

An npm workspaces monorepo. The `plugins/` directory serves double duty: it is
both the workspace glob and the set of relative-path sources in the marketplace
catalog.

```
kensio.ai/
├── .claude-plugin/
│   └── marketplace.json          # the plugin catalog
├── plugins/
│   └── <skill-name>/             # one folder per skill — also an npm package
│       ├── package.json          # @kensio/<skill-name>, own semver version
│       ├── .claude-plugin/
│       │   └── plugin.json       # name, description, version, author
│       └── skills/
│           └── <skill-name>/
│               └── SKILL.md
├── scripts/                      # validation helpers
└── package.json                  # workspaces: ["plugins/*"]
```

Each plugin folder must be **self-contained** — no `../` references outside it.
Plugins get copied, zipped, and installed standalone, so those paths would not
resolve.

## Adding a skill

See
[`plugins/skill-template`](plugins/skill-template/skills/skill-template/SKILL.md)
for the full walkthrough. In short: create `plugins/<skill-name>/` with the
layout above, add a matching entry to `.claude-plugin/marketplace.json`, and run
the checks.

## Development

```bash
npm install
npm run check
```

- `npm run format` — formats JSON, Markdown and JavaScript with
  [oxfmt](https://oxc.rs/docs/guide/usage/formatter). `npm run format:check` is
  the read-only version CI runs.
- `npm run validate` — runs `claude plugin validate --strict` against the
  marketplace manifest and every plugin it lists. Requires the Claude Code CLI
  (`npm install -g @anthropic-ai/claude-code`); no authentication needed.
- `npm run check:versions` — asserts that each plugin's `plugin.json` and
  `package.json` carry the same version, that names match their folder, and that
  the marketplace catalog and `plugins/` directory agree.

Formatter settings live in [`.oxfmtrc.json`](.oxfmtrc.json). Two of them are
deliberate: `proseWrap: "always"` rewraps Markdown prose at `printWidth`, so
paragraphs never need wrapping by hand, and `embeddedLanguageFormatting: "off"`
leaves fenced code samples exactly as written, since those are hand-tuned
illustrations rather than code to be normalised.

Both run in CI on every push and pull request
([`.github/workflows/validate.yml`](.github/workflows/validate.yml)), along with
a `npm pack --dry-run` over the workspaces.

## Releasing

A skill's version lives in two places and both must move together — npm reads
`package.json`, Claude Code reads `plugin.json`:

```bash
npm version patch --workspace @kensio/<skill-name>
```

Mirror that version into `plugins/<skill-name>/.claude-plugin/plugin.json`, run
`npm run check`, commit, then tag the release:

```bash
claude plugin tag plugins/<skill-name> --push
```

## Licence

Apache License 2.0 — see [LICENSE](LICENSE). Chosen over MIT for its explicit
patent grant, which suits skills intended for use inside businesses.
