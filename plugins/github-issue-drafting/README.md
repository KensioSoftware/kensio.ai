# @kensio/github-issue-drafting

A way of turning a one-line note into a GitHub issue somebody can act on, packaged as an agent
skill.

The note is the easy part. "SSM params", "fix the retry backoff", "the CLI hangs on empty input" all
carry enough for the person who wrote them and too little for anybody else. Handed straight to an
LLM they produce a polished issue full of invented detail, which is worse than the note was.

## Install

Into any agent that reads `SKILL.md`:

```bash
npx @kensio/skills add github-issue-drafting
```

That copies the skill directory into `.agents/skills/`, where Codex, Cursor, Copilot, Gemini CLI and
the other implementations of the specification look for one. Pass `--agent claude` for
`.claude/skills/`, `--agent copilot` for `.github/skills/`, and `--user` to install it for every
project at once.

Claude Code also takes it as a plugin:

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install github-issue-drafting@kensio
```

Or pin it in a repository as a dependency:

```bash
npm install @kensio/github-issue-drafting
```

Every skill is also published as a zip on each
[release](https://github.com/KensioSoftware/kensio.ai/releases), for a machine with no npm reach.
Unzip it into `.agents/skills/` and it is installed.

## What it does

**Reads the repository before drafting.** Greps for the identifiers in the note, reads the code that
would change and its tests, checks what the docs already promise, skims recent history, and searches
open and closed issues for duplicates. Half-built is the common case, and an issue asking for a
feature that already half exists embarrasses whoever filed it.

**Separates what it confirmed from what it assumed.** Anything the investigation failed to settle
comes back as a question under the draft, and goes into the body as a stated assumption.

**Splits a note that is really two issues.** One note frequently spans several pull requests, and
filed whole it becomes a branch that is hard to review and hard to stop halfway. The skill carries
the seams that yield independently shippable issues (a usable surface before what sits on top of it,
a blocked piece, a distinct usage mode) and the seams that fail (one issue per function,
implementation split from its tests, docs on their own).

**Follows the repository's conventions over its own.** An `.github/ISSUE_TEMPLATE/` wins. So does
the register of the issues already filed.

**Stops before posting.** The draft arrives in chat. Filing needs an explicit go-ahead, and then it
goes through `gh` with the type and labels that the repository actually has.

**Writes titles people can find.** Issues are indexed and they outrank pull requests. The title and
the opening paragraph are the search snippet, which makes plain words worth more than internal
shorthand. There is a line past which a title reads as written for a crawler, and the skill sets out
where it falls.

It also covers issues that already exist, retitling them and backfilling a missing type or label,
including closed ones.

## Two things it gets right that are easy to get wrong

**Private detail.** Notes and stack traces carry customer names, internal hostnames, ticket ids,
paths with a username in them, and occasionally a token. A public issue is publication, so the skill
redacts by default and asks about anything borderline.

**Hard-wrapped bodies.** GitHub renders issue Markdown with the GFM hard-line-break extension, so
every newline inside a paragraph becomes a `<br>`. A repository whose prose wraps at 80 columns
produces visibly ragged issues the moment that habit reaches a body. Paragraphs go in as one long
line.

## Related skills

[`technical-prose-style`](https://github.com/KensioSoftware/kensio.ai/tree/main/plugins/technical-prose-style)
and [`avoid-ai-writing`](https://github.com/conorbronsdon/avoid-ai-writing) are used for the body
text where they are installed. Neither is required.

Part of [kensio.ai](https://github.com/KensioSoftware/kensio.ai). Licensed under the Apache License
2.0. See the [LICENSE](https://github.com/KensioSoftware/kensio.ai/blob/main/LICENSE) in the
repository root.
