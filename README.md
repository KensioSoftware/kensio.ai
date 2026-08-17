# kensio.ai

[https://kensio.ai](https://kensio.ai "Kensio AI Skills & Tooling")

Agent skills from [Kensio Software](https://kensiosoftware.co.uk). Reusable, opinionated ways of
working, written to the [Agent Skills specification](https://agentskills.io/specification) and
installable into any agent that reads `SKILL.md`.

This repository is the canonical source. Each skill is a directory under
`plugins/<name>/skills/<name>/`, and that directory is the whole artefact. The plugin folder around
it, the npm package, the release zip and the installer are four ways of delivering the same files.

The three testing skills are a set: `isolated-testing-style` is a way of writing tests, and
`yulin-aws-simulation` and `part-factory-test-data` cover two Kensio packages that serve it.
`technical-prose-style`, `pangram-check` and `github-issue-drafting` all cover writing. The first
two are a pair, one measuring how prose reads and the other reporting what a detector makes of it,
and the third covers issue text. `dynamodb-single-table` is a data modelling skill and stands on its
own. `skill-template` is the starting point for writing a new skill.

## Install

### Into any agent (recommended)

```bash
npx @kensio/skills add isolated-testing-style
```

That copies the skill directory into `.agents/skills/`, the cross-tool convention read by Codex CLI,
Cursor, VS Code, Gemini CLI and the rest. `--agent claude` puts it in `.claude/skills/` and
`--agent copilot` in `.github/skills/`. `--user` installs under your home directory for every
project, `--all` takes every skill, and `list` prints what there is.

The [installer](packages/skills-cli) carries the skills inside the package, so it needs the network
only for the fetch.

Where an agent looks for skills:

| Agent               | In a project                                            | For every project                                              |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| Codex CLI           | `.agents/skills/`                                       | `~/.agents/skills/`                                            |
| VS Code and Copilot | `.github/skills/`, `.claude/skills/`, `.agents/skills/` | `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |
| Claude Code         | `.claude/skills/`, or a plugin                          | `~/.claude/skills/`                                            |
| Anything else       | `.agents/skills/`                                       | `~/.agents/skills/`                                            |

Check your own agent's documentation for the last row. The specification defines the directory
layout and leaves the search paths to each implementation, and `.agents/skills/` is where they have
converged.

### As a Claude Code plugin

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install isolated-testing-style@kensio
```

The same commands work as slash commands inside a session:

```
/plugin marketplace add KensioSoftware/kensio.ai
/plugin install isolated-testing-style@kensio
```

Claude Code only notices an update when a plugin's `version` changes, so pick up new releases with:

```bash
claude plugin update isolated-testing-style@kensio
```

### From npm

Every skill is also published as a scoped package, all sharing one version:

```bash
npm install @kensio/isolated-testing-style
```

The package contains the plugin folder as-is (`.claude-plugin/` plus `skills/`). Point Claude Code
at it as a local plugin, or copy `node_modules/@kensio/<name>/skills/<name>` into your agent's
skills directory.

### From an archive

Every [release](https://github.com/KensioSoftware/kensio.ai/releases) carries a zip per skill, plus
one holding all of them, for machines with neither git nor npm reach (air-gapped hosts, CI images,
locked-down client environments). Each zip holds the skill directory at its root:

```bash
unzip isolated-testing-style-1.11.0.zip -d .agents/skills/
```

## Available skills

| Skill                                                      | npm                              | What it does                                                                                  |
| ---------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| [`isolated-testing-style`](plugins/isolated-testing-style) | `@kensio/isolated-testing-style` | Given/when/then first, real collaborators through simulation, isolation from randomised data. |
| [`yulin-aws-simulation`](plugins/yulin-aws-simulation)     | `@kensio/yulin-aws-simulation`   | Testing AWS code with the [Yulin](https://yulinsim.dev/) in-process simulator.                |
| [`part-factory-test-data`](plugins/part-factory-test-data) | `@kensio/part-factory-test-data` | Building test data with [Part Factory](https://partfactory.dev/).                             |
| [`technical-prose-style`](plugins/technical-prose-style)   | `@kensio/technical-prose-style`  | A measured prose style for documentation, with a checker calibrated on human writing.         |
| [`pangram-check`](plugins/pangram-check)                   | `@kensio/pangram-check`          | Running finished writing past the [Pangram](https://www.pangram.com) AI-text detector.        |
| [`github-issue-drafting`](plugins/github-issue-drafting)   | `@kensio/github-issue-drafting`  | Drafting GitHub issues grounded in the repository they are filed against.                     |
| [`dynamodb-single-table`](plugins/dynamodb-single-table)   | `@kensio/dynamodb-single-table`  | Modelling DynamoDB data as one table, with keys built from the access patterns.               |
| [`skill-template`](plugins/skill-template)                 | `@kensio/skill-template`         | Copy-and-edit starting point for writing a new skill.                                         |

The first three are meant to be read together. `isolated-testing-style` is the philosophy, and the
other two are tools that serve it.

## Repository layout

A pnpm workspace monorepo. The `plugins/` directory serves double duty. It is both a workspace glob
and the set of relative-path sources in the marketplace catalog.

```
kensio.ai/
├── .claude-plugin/
│   └── marketplace.json          # the plugin catalog
├── plugins/
│   └── <skill-name>/             # one folder per skill, also an npm package
│       ├── package.json          # @kensio/<skill-name>, version set by the release
│       ├── .claude-plugin/
│       │   └── plugin.json       # name, description, version, author
│       └── skills/
│           └── <skill-name>/     # the skill itself, and the only portable part
│               ├── SKILL.md      # frontmatter to the Agent Skills specification
│               ├── references/   # optional, loaded on demand
│               └── scripts/      # optional, anything the skill runs
├── packages/
│   └── skills-cli/               # @kensio/skills, the installer
├── scripts/                      # validation, versioning and packaging helpers
└── pnpm-workspace.yaml           # packages: ["plugins/*", "packages/*"]
```

Each plugin folder must be **self-contained**, with no `../` references outside it. Plugins get
copied, zipped, and installed standalone, so those paths would not resolve.

The same holds one level further in, and more strictly. A skill directory is installed on its own,
under a path this repository never sees, so every path a `SKILL.md` mentions has to be relative to
that directory. `pnpm validate:skills` fails the build on any that reaches outside it.

## Adding a skill

See [`plugins/skill-template`](plugins/skill-template/skills/skill-template/SKILL.md) for the full
walkthrough. In short, create `plugins/<skill-name>/` with the layout above, add a matching entry to
`.claude-plugin/marketplace.json`, and run the checks.

## Development

```bash
pnpm install
pnpm check
```

- `pnpm format` — formats JSON, Markdown and JavaScript with
  [oxfmt](https://oxc.rs/docs/guide/usage/formatter). `pnpm format:check` is the read-only version
  CI runs.
- `pnpm validate:skills` — checks every skill against the
  [Agent Skills specification](https://agentskills.io/specification). Frontmatter keys, the name
  rules, the description ceiling, and that every path and link in the body resolves inside the skill
  directory. Needs nothing installed.
- `pnpm validate` — runs `claude plugin validate --strict` against the marketplace manifest and
  every plugin it lists. Requires the Claude Code CLI (`npm install -g @anthropic-ai/claude-code`),
  and no authentication needed.
- `pnpm check:versions` — asserts that every `plugin.json`, `package.json` and `SKILL.md` carries
  the same version as the root `package.json`, that names match their folder, and that the
  marketplace catalog and `plugins/` directory agree.
- `pnpm bundle` — copies the skills into `@kensio/skills`, where the installer reads them. Generated
  and gitignored, rebuilt on every pack and before every publish.
- `pnpm zips` — builds the release archives into `dist/`, one per skill and one holding all of them.

Formatter settings live in [`.oxfmtrc.json`](.oxfmtrc.json). Two of them are deliberate:
`proseWrap: "always"` rewraps Markdown prose at `printWidth`, so paragraphs never need wrapping by
hand, and `embeddedLanguageFormatting: "off"` leaves fenced code samples exactly as written, since
those are hand-tuned illustrations and normalising them would spoil them.

All of them run in CI on every push and pull request
([`.github/workflows/validate.yml`](.github/workflows/validate.yml)), along with an
`npm pack --dry-run` over each package directory and a build of the release archives.

## Releasing

Releases are automatic. Every merge to `main` runs [`release.yml`](.github/workflows/release.yml),
which reads the conventional-commit subjects since the last tag, works out the next version, and
either releases it or stays put.

**Do not edit version numbers by hand.** The release decides them, and
[`check-versions.mjs`](scripts/check-versions.mjs) fails the build if they drift.

### How the version is decided

The PR title is the commit subject that lands on `main`, because merges are squash-only and the
squash title is set to the PR title. [`pr-title.yml`](.github/workflows/pr-title.yml) lints it. The
string the version is derived from is always one that has been checked.

| PR title                        | Effect            |
| ------------------------------- | ----------------- |
| `fix: …` or `perf: …`           | patch             |
| `feat: …`                       | minor             |
| `feat!: …` or `BREAKING CHANGE` | major             |
| `docs: …`, `chore: …`, `ci: …`  | no release at all |

### The version bump comes back as a pull request

The `main` ruleset requires pull requests, and the built-in GitHub Actions app cannot be added to
its bypass list, and GitHub rejects it, because it lives outside the organisation's installed apps.
Tags are unaffected, since the ruleset targets `refs/heads/main` only. The release still tags and
publishes directly and only the manifest bump needs a pull request.

**That pull request does need merging.** The marketplace serves `plugin.json` from `main`, so until
it lands, the tag and the registry are ahead of what anyone installing from the marketplace sees. It
is opened by the release workflow. The required checks cannot post against it (a pull request
created with `GITHUB_TOKEN` does not trigger workflow runs), and it is merged with an admin bypass.

### One version, everywhere

Every manifest carries the same number, written by [`set-version.mjs`](scripts/set-version.mjs). The
root `package.json`, each plugin's `package.json` and `plugin.json`, the installer's `package.json`,
and the `metadata.version` in each `SKILL.md`. A version therefore means the same commit whether it
came from the marketplace, from npm, from a zip, or out of `npx @kensio/skills`.

The frontmatter is in that list because a skill directory travels alone. A copy sitting in someone's
`.agents/skills/` has no package.json beside it, and the number in the frontmatter is then the only
way to tell what it is.

The trade-off is that a release republishes every plugin, so Claude Code offers an update for
plugins that did not change. That is deliberate, because lockstep versions are much easier to reason
about than five independent ones, and the packages are small.

### npm publishing

Publishing is gated on the `PUBLISH_NPM` repository variable. The workflow can be exercised before
anything becomes permanent on npm. Until it is set, releases are tagged on GitHub only:

```bash
gh variable set PUBLISH_NPM --body true
```

`publish-npm.mjs` also takes `--dry-run`, which packs each plugin and skips the upload, so the
script can be exercised locally without touching the registry:

```bash
PUBLISH_NPM=true node scripts/publish-npm.mjs 1.0.0 --dry-run
```

Authentication is npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) over OIDC,
there is no npm token in this repository. Each package needs its trusted publisher configured once
on npmjs.com before it can be published this way.

#### Bootstrapping a package onto npm

Trusted publishing is configured on a package's settings page on npmjs.com, which means the package
has to exist before it can be configured. npm has no equivalent of PyPI's pending publishers, and
the first version of every package is published by hand.

```bash
git checkout v<version>
node scripts/set-version.mjs <version>
node scripts/bundle-skills.mjs            # only for ./packages/skills-cli
npm publish ./plugins/<name> --access public
```

`@kensio/skills` is bootstrapped the same way, from `./packages/skills-cli`. Its `skills/` directory
is generated, so the bundle step above has to run first or it publishes an installer with nothing in
it.

`set-version` is the step that is easy to miss. semantic-release tags the commit before it writes
the version into the manifests. A clean checkout of the tag still carries the previous number, and
publishing straight from it would put the wrong version on npm.

The `./` prefix is load-bearing. npm reads a bare `plugins/<name>` as the GitHub shorthand
`owner/repo` and tries to clone it. That first version carries no provenance attestation, because
provenance is minted from the workflow's OIDC token and there is no workflow involved. Every version
after it does.

Then, for each package, under **Settings → Trusted Publisher** on npmjs.com:

| Field       | Value            |
| ----------- | ---------------- |
| Publisher   | GitHub Actions   |
| Owner       | `KensioSoftware` |
| Repository  | `kensio.ai`      |
| Workflow    | `release.yml`    |
| Environment | `release`        |

A new plugin added later needs the same two steps before its first release. `publish-npm.mjs`
detects a package that has never been published, skips it, and prints these commands rather than
failing the release, so one new plugin cannot strand the ones that published cleanly.

#### Why the release job names an environment

A trusted publisher binds to an owner, a repository and a workflow filename, and not to a ref. On
its own that would let any run of `release.yml` publish, including a modified copy pushed to a
branch and started by hand through `workflow_dispatch`. The `release` environment closes that. Its
deployment rule allows `main` only. A run from any other ref cannot enter it, and fails before
reaching `npm publish`. The environment name is itself an OIDC claim, which is why it has to match
on both sides.

It deliberately carries no reviewers and no wait timer. A protection rule that waits for a human
would stall every release at exactly the point where the tag exists and the registry has not caught
up.

## Licence

Apache License 2.0. See [LICENSE](LICENSE). Chosen over MIT for its explicit patent grant, which
suits skills intended for use inside businesses.
