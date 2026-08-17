# @kensio/technical-prose-style

A technical writing style for documentation, packaged as an agent skill. It targets the
constructions that make unedited LLM prose tiring to read, and it ships the measurement that picked
them.

The goal is prose that costs the reader less. Concealment is a different aim and out of scope. Text
that follows every rule here is still identified as machine-written by a commercial detector. Six
rewritten documents were put through one to check.

Most writing guidance for LLMs is a list of banned words. Word lists can be obeyed completely while
the prose still reads as machine-written, because the tells are syntactic. This skill was built by
measuring 192,000 words of Claude-written documentation against 66,000 words of Django, Go, Rust and
Python documentation, and keeping only the patterns where the two differed by a factor of two or
more. Thresholds are set so that no human document in the corpus fails and every LLM document does.

## Install

Into any agent that reads `SKILL.md`:

```bash
npx @kensio/skills add technical-prose-style
```

That copies the skill directory into `.agents/skills/`, where Codex, Cursor, Copilot, Gemini CLI and
the other implementations of the specification look for one. Pass `--agent claude` for
`.claude/skills/`, `--agent copilot` for `.github/skills/`, and `--user` to install it for every
project at once.

Claude Code also takes it as a plugin:

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install technical-prose-style@kensio
```

Or pin it in a repository as a dependency:

```bash
npm install @kensio/technical-prose-style
```

Every skill is also published as a zip on each
[release](https://github.com/KensioSoftware/kensio.ai/releases), for a machine with no npm reach.
Unzip it into `.agents/skills/` and it is installed.

## The patterns

**Significance tail.** A fact, then a comma, then a clause explaining why the fact matters. Measured
at 8.1 times the human rate. State the fact and leave the working out.

**Contrastive definition.** Defining a thing by the alternative it displaces, with `rather than` or
`instead of`. 6.2 times.

**Contrastive coda.** The same move wearing a comma, as in `assert behaviour, not call counts`. 8.3
times, and the sharpest separation in the study. It went undetected for four releases, because the
regex above only ever matched the two-word forms.

**Negation framing.** Sentences built on `nothing`, `is not`, `does not`. 5.2 times. "Nothing here
replaces the process clock" is "time belongs to this instance", written backwards.

**Appositive tail.** A trailing `, which is` or `, which means` that comments on its own sentence.
5.3 times.

**Colon explainer.** A colon joining a claim to a restatement of itself. 2.3 times, and it rose as
em dashes were banned. The construction moved and never went away.

**One name for one thing.** Distinct words per 100 is the cleanest separator found. 15 human
documents average 0.628 and none exceeds 0.664, while 55 LLM documents average 0.685 and none falls
below 0.658. Human technical writing names a thing and goes on naming it that. It ships as advisory,
because padding with repeated words would move the number the right way and make the prose worse.

## Short listing strings

The rules above are calibrated on documents of 200 words and more. A package description or a card
subtitle is a different genre, and the skill carries a separate section for it. Forty descriptions
from long-established npm packages have a median length of seven words, and not one of them uses the
`Thing for X: doing A, doing B, and doing C` shape that an LLM reaches for every time.

## What it tells you to leave alone

The measurement also found what fails to separate good prose from bad. That turns out to be most of
a normal style guide.

- **Sentence length.** 20.9 words against 19.8. Long sentences were slightly more common in the
  human corpus.
- **AI vocabulary.** Django and Effective Go use `powerful`, `robust`, `crucial` and friends ten
  times more often than the Claude corpus did. A word list measures compliance with a word list.
- **Em dashes.** Punctuation is where the habit lands. Closing one mark moves it to the next.
- **The rule of three and parataxis.** A spaCy dependency parse found the exemplars using prose
  triples twice as often and parataxis seven times as often. Both are marks of the human corpus.

## The checker

The skill includes a checker that scores markdown against every pattern and prints the worst
sentence for each one over threshold.

```bash
node skills/technical-prose-style/scripts/prose-check.mjs docs/
```

Rates are per 1000 words, compared against the human baseline. `--json` gives machine-readable
output and `--examples N` prints more samples. A non-zero exit means something is over a fail
threshold. The checker drops into CI as it stands.

Full method, corpora and dropped candidates are in
[`reference/measurements.md`](skills/technical-prose-style/reference/measurements.md).

Part of [kensio.ai](https://github.com/KensioSoftware/kensio.ai). Licensed under the Apache License
2.0. See the [LICENSE](https://github.com/KensioSoftware/kensio.ai/blob/main/LICENSE) in the
repository root.
