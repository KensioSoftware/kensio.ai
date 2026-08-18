---
name: pangram-check
description: Send the prose of a finished document to Pangram, a commercial AI-text detector, and report which passages read as machine-drafted, with the source line each one starts on. Use when the user asks to "check this with Pangram", "run the AI detector over this", "see if this still reads as AI", or wants a final sweep after rewriting a draft. Every run is paid and sends the writing to a third party, so this skill is invoked by name.
license: Apache-2.0
compatibility: Needs a Pangram API key and network access. Every run is billed.
metadata:
  version: "1.14.0"
disable-model-invocation: true
---

# Pangram check

A final sweep over a finished document. Pangram scores the text in windows of a few hundred words
and reports which parts read as machine-drafted, so a long document gets a passage-by-passage
answer.

```bash
node scripts/pangram-check.mjs path/to/file.md
```

Full flag list and config file in [references/configuration.md](references/configuration.md). Field
meanings and how to read a verdict in
[references/reading-results.md](references/reading-results.md).

## Confirm before spending a call

Every run costs the user money and sends their writing to a third party. Before the first call of a
session:

1. Name the file that is about to go out.
2. Give the word count and the billable estimate. `--dry-run` prints both and sends nothing.
3. Wait for a yes.

This skill sets `disable-model-invocation: true`. It runs when a user asks for it by name, and never
as a step some other task decided to take. A skill that drafts or rewrites text may mention it and
stop there.

## Check the key first

On a machine that has not run this before:

```bash
node scripts/pangram-check.mjs --check-key
```

That checks the key against `GET /models` and spends no detection call. With no key found, the
script prints where it looked and how to store one. Pass that message on as it stands. Never print,
echo or paste the key itself, and never put it in a shell command the user will see.

The key is read from `$PANGRAM_API_KEY`, then `$PANGRAM_ENV_FILE`, then `~/.config/pangram/.env`,
then `./.env`. Recommend the third one, which every repository on the machine can reach.

## Only the prose is sent

The document is reduced to its prose before the call, and that reduced text is what Pangram
receives. Frontmatter, code blocks, HTML comments, images, shortcodes, raw HTML, tables, headings
and URLs are all removed. Link text and inline code keep their words.

Check what would go out with `--print-prose`. The word count the script reports is that same string,
so a document reporting `512 words of prose` sent exactly those 512 words whatever the file length.

This matters for reading the verdict. A page that is mostly code would otherwise have its bash and
JSON scored alongside the writing, which pulls the fractions towards human for reasons unrelated to
how the prose reads.

Wrap quoted material in `<!-- pangram-check:off -->` and `<!-- pangram-check:on -->` to keep someone
else's writing out of the score.

## The guards

Two of them refuse to send anything.

- **Under 50 words of prose:** Pangram's own documented floor, below which it declines to predict.
- **Under `--min-words`** (300 by default). Pangram predicts from 50 words up with less confidence
  the shorter the text. Lower the floor for a short document, and treat the verdict as weaker.

A repository can add its own with `rejectPatterns` in `.pangram-check.json`, or `--reject <regex>`
for one run. `--reject-todo` is the preset for the common case, where a `TODO` marker means a
paragraph is still to be written and scoring it would spend a paid call on a draft.

`--max-units <n>` refuses a document over a cost ceiling. One billable unit is each started block of
1000 words.

## Repeat runs are free

Results are cached by a hash of the extracted prose, so running the same unchanged document again
reads the cache and calls nothing. Edit the prose and the next run is a fresh call. `--refresh`
forces one, `--no-cache` skips the cache in both directions.

There is deliberately no score history and no before-and-after delta. Both would invite treating the
number as a target.

## Output

`--format text` (the default) colour-codes scores on a terminal and draws the windows in reading
order. `--format markdown` gives a table to paste into a report. `--format json` carries every field
plus the source line for each window.

## Reporting back

Give the user the headline, the three fractions, and the worst two or three windows with their
scores and line references. Point at the passages by line so they can open them.

Leave the judgement about rewriting to the user. A high score marks a passage worth rereading, and
it is not a number to drive down. Editing to move a detector score is a different activity from
writing in your own voice, and the two come apart quickly.

## Limits

Pangram reports whether text reads as machine-generated. It has no opinion on whether the writing is
any good, and a document can come back fully human while being badly organised.

A `is_humanized` flag on a window is a stronger signal than a high score by itself, because it means
the passage looks like text that has been worked over to read as human.

Detectors carry false positives, which fall hardest on writers working in a second language. Treat
one verdict as one input to a rereading, never as proof of authorship, and say so if a user starts
treating it as proof.

## Related skills

`technical-prose-style` covers a different question. It measures the constructions that make prose
tiring to read, and its own measurements show that text following every one of its rules is still
identified as machine-written. Style and provenance are separate signals. Anyone after concealment
is holding the wrong tool.
