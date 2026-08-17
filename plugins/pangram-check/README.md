# @kensio/pangram-check

Runs a finished document past [Pangram](https://www.pangram.com), a commercial AI-text detector, and
reports which passages read as machine-drafted. Packaged as an agent skill.

Only the prose is sent. The script strips frontmatter, code, HTML, shortcodes, tables and headings
first, then maps every result Pangram returns back to the source line it came from, so a flagged
passage is a `file:line` reference and not a paragraph to go hunting for.

Pangram is a paid service and the skill needs an API key. It runs when a user asks for it by name.

## Install

Into any agent that reads `SKILL.md`:

```bash
npx @kensio/skills add pangram-check
```

That copies the skill directory into `.agents/skills/`, where Codex, Cursor, Copilot, Gemini CLI and
the other implementations of the specification look for one. Pass `--agent claude` for
`.claude/skills/`, `--agent copilot` for `.github/skills/`, and `--user` to install it for every
project at once.

Claude Code also takes it as a plugin:

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install pangram-check@kensio
```

Or pin it in a repository as a dependency:

```bash
npm install @kensio/pangram-check
```

Every skill is also published as a zip on each
[release](https://github.com/KensioSoftware/kensio.ai/releases), for a machine with no npm reach.
Unzip it into `.agents/skills/` and it is installed.

## Set up the key

Get one from the Pangram dashboard, then put it where every repository on the machine can reach it:

```bash
mkdir -p ~/.config/pangram
printf 'PANGRAM_API_KEY=%s\n' 'the-key' > ~/.config/pangram/.env
chmod 600 ~/.config/pangram/.env
```

Then check it. This hits `GET /models` and spends no detection call:

```bash
node skills/pangram-check/scripts/pangram-check.mjs --check-key
```

`$PANGRAM_API_KEY` and `$PANGRAM_ENV_FILE` both work too, and a `./.env` in the working directory is
the last place searched. The key is never printed, and it is redacted from any error text.

## Use it

```bash
node skills/pangram-check/scripts/pangram-check.mjs post.md
```

```
post.md
  742 words of prose, an estimated 1 billable unit.

  AI Detected
  This document was likely written with the help of a large language model.
  42% AI · 35% AI-assisted · 23% human
  segments: 2 AI, 1 AI-assisted, 1 human

  reading order  ▁▂▇▄▁▁▃  one cell per window, start to end

  7 windows, worst 3 first:

  █████████░ 0.91  AI, high confidence  post.md:112  humanized 0.73
     "the opening of the passage…"
```

Scores are colour-coded on a terminal. `--format markdown` gives a table to paste into a report, and
`--format json` carries every field with the line references added.

## What it will refuse to do

Every run costs money, so the script checks the document is worth a call before making one.

- **Under 50 words of prose:** Pangram's own
  [documented floor](https://www.pangram.com/blog/why-does-pangram-have-a-minimum-word-count).
- **Under 300 words**, which is this skill's own default and is loosened with `--min-words`. Pangram
  predicts from 50 words up, with less confidence the shorter the text.
- **Over a cost ceiling** set with `--max-units`. One billable unit is each started block of 1000
  words.
- **Any pattern a repository has told it to refuse:** `--reject-todo` covers the common case, where
  a `TODO` marker means a paragraph is still to be written. `--reject <regex>` takes anything else.

`--dry-run` runs all of that without sending the document. `--print-prose` prints the exact string
that would go out.

Results are cached by a hash of the extracted prose, so re-running an unchanged document is free.
There is deliberately no score history and no before-and-after delta, because both invite treating
the number as a target.

## Configuration

A `.pangram-check.json` beside the document (or anywhere above it) sets the defaults for a
repository, and flags override it:

```json
{
  "minWords": 400,
  "rejectTodo": true,
  "format": "markdown",
  "windows": 3
}
```

Full flag list, extraction rules and cache locations are in
[`reference/configuration.md`](skills/pangram-check/reference/configuration.md). What each API field
means, and which signals to act on, are in
[`reference/reading-results.md`](skills/pangram-check/reference/reading-results.md).

## What a score is for

A high score marks a passage worth rereading. It is not a number to drive down. Editing to move a
detector score is a different activity from writing in your own voice, and the two come apart
quickly.

Pangram reports whether text reads as machine-generated, and it has no opinion on whether the
writing is any good. Detectors also carry false positives, which published audits have found falling
hardest on writers working in a second language. One verdict is one input to a rereading, never
evidence about a person.

## Related

[`@kensio/technical-prose-style`](https://www.npmjs.com/package/@kensio/technical-prose-style)
measures the constructions that make prose tiring to read. Its own measurements show text that
follows every one of its rules still being identified as machine-written, which is the clearest
demonstration that style and provenance are separate signals. Anyone after concealment is holding
the wrong tool.

Part of [kensio.ai](https://github.com/KensioSoftware/kensio.ai). Licensed under the Apache License
2.0. See the [LICENSE](https://github.com/KensioSoftware/kensio.ai/blob/main/LICENSE) in the
repository root.
