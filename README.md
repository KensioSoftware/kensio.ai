# kensio.ai

[https://kensio.ai](https://kensio.ai "Kensio AI Skills & Tooling")

Claude Code skills from [Kensio Software](https://kensiosoftware.co.uk) — reusable, opinionated ways
of working, packaged as installable plugins.

This repository is the canonical source. Each skill is a self-contained plugin that can be installed
from the Claude Code marketplace, from npm, or (later) as a downloadable archive.

The first three real skills are a set: `isolated-testing-style` is a way of writing tests, and
`yulin-aws-simulation` and `part-factory-test-data` cover two Kensio packages that serve it.
`hello-world` and `skill-template` remain as examples that validate the structure end to end.

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

Claude Code only notices an update when a plugin's `version` changes, so pick up new releases with:

```bash
claude plugin update hello-world@kensio
```

### From npm

Every skill is also published as a scoped package, all sharing one version:

```bash
npm install @kensio/hello-world
```

The package contains the plugin folder as-is (`.claude-plugin/` plus `skills/`), so point Claude
Code at it — or at `node_modules/@kensio/<skill-name>` — as a local plugin.

### From an archive

Zips of each plugin will be published on kensio.ai for machines that have neither git nor npm access
(air-gapped hosts, CI images, locked-down client environments). Not available yet.

## Available skills

| Skill                                                      | npm                              | What it does                                                                                  |
| ---------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| [`isolated-testing-style`](plugins/isolated-testing-style) | `@kensio/isolated-testing-style` | Given/when/then first, real collaborators through simulation, isolation from randomised data. |
| [`yulin-aws-simulation`](plugins/yulin-aws-simulation)     | `@kensio/yulin-aws-simulation`   | Testing AWS code with the [Yulin](https://yulinsim.dev/) in-process simulator.                |
| [`part-factory-test-data`](plugins/part-factory-test-data) | `@kensio/part-factory-test-data` | Building test data with [Part Factory](https://partfactory.dev/).                             |
| [`hello-world`](plugins/hello-world)                       | `@kensio/hello-world`            | Minimal example that confirms the install path works.                                         |
| [`skill-template`](plugins/skill-template)                 | `@kensio/skill-template`         | Copy-and-edit starting point for writing a new skill.                                         |

The first three are meant to be read together. `isolated-testing-style` is the philosophy, and the
other two are tools that serve it.

## Repository layout

A pnpm workspace monorepo. The `plugins/` directory serves double duty: it is both the workspace
glob and the set of relative-path sources in the marketplace catalog.

```
kensio.ai/
├── .claude-plugin/
│   └── marketplace.json          # the plugin catalog
├── plugins/
│   └── <skill-name>/             # one folder per skill — also an npm package
│       ├── package.json          # @kensio/<skill-name>, version set by the release
│       ├── .claude-plugin/
│       │   └── plugin.json       # name, description, version, author
│       └── skills/
│           └── <skill-name>/
│               └── SKILL.md
├── scripts/                      # validation helpers
└── pnpm-workspace.yaml           # packages: ["plugins/*"]
```

Each plugin folder must be **self-contained** — no `../` references outside it. Plugins get copied,
zipped, and installed standalone, so those paths would not resolve.

## Adding a skill

See [`plugins/skill-template`](plugins/skill-template/skills/skill-template/SKILL.md) for the full
walkthrough. In short: create `plugins/<skill-name>/` with the layout above, add a matching entry to
`.claude-plugin/marketplace.json`, and run the checks.

## Development

```bash
pnpm install
pnpm check
```

- `pnpm format` — formats JSON, Markdown and JavaScript with
  [oxfmt](https://oxc.rs/docs/guide/usage/formatter). `pnpm format:check` is the read-only version
  CI runs.
- `pnpm validate` — runs `claude plugin validate --strict` against the marketplace manifest and
  every plugin it lists. Requires the Claude Code CLI (`npm install -g @anthropic-ai/claude-code`);
  no authentication needed.
- `pnpm check:versions` — asserts that every `plugin.json` and `package.json` carries the same
  version as the root `package.json`, that names match their folder, and that the marketplace
  catalog and `plugins/` directory agree.

Formatter settings live in [`.oxfmtrc.json`](.oxfmtrc.json). Two of them are deliberate:
`proseWrap: "always"` rewraps Markdown prose at `printWidth`, so paragraphs never need wrapping by
hand, and `embeddedLanguageFormatting: "off"` leaves fenced code samples exactly as written, since
those are hand-tuned illustrations rather than code to be normalised.

Both run in CI on every push and pull request
([`.github/workflows/validate.yml`](.github/workflows/validate.yml)), along with an
`npm pack --dry-run` over each plugin directory.

## Releasing

Releases are automatic. Every merge to `main` runs [`release.yml`](.github/workflows/release.yml),
which reads the conventional-commit subjects since the last tag, works out the next version, and
either releases it or does nothing.

**Do not edit version numbers by hand.** The release decides them, and
[`check-versions.mjs`](scripts/check-versions.mjs) fails the build if they drift.

### How the version is decided

The PR title is the commit subject that lands on `main`, because merges are squash-only and the
squash title is set to the PR title. [`pr-title.yml`](.github/workflows/pr-title.yml) lints it, so
the string the version is derived from is always one that has been checked.

| PR title                        | Effect            |
| ------------------------------- | ----------------- |
| `fix: …` or `perf: …`           | patch             |
| `feat: …`                       | minor             |
| `feat!: …` or `BREAKING CHANGE` | major             |
| `docs: …`, `chore: …`, `ci: …`  | no release at all |

### The version bump comes back as a pull request

The `main` ruleset requires pull requests, and the built-in GitHub Actions app cannot be added to
its bypass list — GitHub rejects it, because it is not an app installed in the organisation. Tags
are unaffected, since the ruleset targets `refs/heads/main` only, so the release still tags and
publishes directly and only the manifest bump needs a pull request.

**That pull request does need merging.** The marketplace serves `plugin.json` from `main`, so until
it lands, the tag and the registry are ahead of what anyone installing from the marketplace sees. It
is opened by the release workflow, so the required checks cannot post against it — a pull request
created with `GITHUB_TOKEN` does not trigger workflow runs — and it is merged with an admin bypass.

### One version, everywhere

All eleven manifests — the root `package.json`, and each plugin's `package.json` and `plugin.json` —
carry the same number, written by [`set-version.mjs`](scripts/set-version.mjs). A version therefore
means the same commit whether it came from the marketplace or from npm.

The trade-off is that a release republishes every plugin, so Claude Code offers an update for
plugins that did not change. That is deliberate: lockstep versions are much easier to reason about
than five independent ones, and the packages are small.

### npm publishing

Publishing is gated on the `PUBLISH_NPM` repository variable, so the workflow can be exercised
before anything becomes permanent on npm. Until it is set, releases are tagged on GitHub only:

```bash
gh variable set PUBLISH_NPM --body true
```

Authentication is npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) over OIDC —
there is no npm token in this repository. Each package needs its trusted publisher configured once
on npmjs.com before it can be published this way.

## Licence

Apache License 2.0 — see [LICENSE](LICENSE). Chosen over MIT for its explicit patent grant, which
suits skills intended for use inside businesses.
