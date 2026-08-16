# @kensio/technical-prose-style

A technical writing style for Claude Code, packaged as a skill. It targets five sentence shapes, and
it ships the measurement that picked them.

Most writing guidance for LLMs is a list of banned words. Word lists can be obeyed completely while
the prose still reads as machine-written, because the tells are syntactic. This skill was built by
measuring 192,000 words of Claude-written documentation against 66,000 words of Django, Go, Rust and
Python documentation, and keeping only the patterns where the two differed by a factor of two or
more. Thresholds are set so that no human document in the corpus fails and every LLM document does.

## Install

From the marketplace:

```bash
claude plugin marketplace add KensioSoftware/kensio.ai
claude plugin install technical-prose-style@kensio
```

From npm:

```bash
npm install @kensio/technical-prose-style
```

## The five patterns

**Significance tail.** A fact, then a comma, then a clause explaining why the fact matters. Measured
at 8.1 times the human rate, the sharpest of the five. State the fact and leave the working out.

**Contrastive definition.** Defining a thing by the alternative it displaces, with `rather than` or
`instead of`. 6.2 times.

**Negation framing.** Sentences built on `nothing`, `is not`, `does not`. 5.2 times. "Nothing here
replaces the process clock" is "time belongs to this instance", written backwards.

**Appositive tail.** A trailing `, which is` or `, which means` that comments on its own sentence.
5.3 times.

**Colon explainer.** A colon joining a claim to a restatement of itself. 2.3 times, and it rose as
em dashes were banned. The construction moved rather than went away.

## What it tells you to leave alone

The measurement also found what fails to separate good prose from bad. That turns out to be most of
a normal style guide.

- **Sentence length.** 20.9 words against 19.8. Long sentences were slightly more common in the
  human corpus.
- **AI vocabulary.** Django and Effective Go use `powerful`, `robust`, `crucial` and friends ten
  times more often than the Claude corpus did. A word list measures compliance with a word list.
- **Em dashes.** Punctuation is where the habit lands, not the habit.
- **The rule of three and parataxis.** A spaCy dependency parse found the exemplars using prose
  triples twice as often and parataxis seven times as often. Both are marks of the human corpus.

## The checker

The skill includes a script that scores markdown against the five patterns and prints the worst
sentence for each one over threshold.

```bash
node skills/technical-prose-style/scripts/prose-check.mjs docs/
```

Rates are per 1000 words, compared against the human baseline. `--json` gives machine-readable
output and `--examples N` prints more samples. A non-zero exit means something is over a fail
threshold, so the script drops into CI as it stands.

Full method, corpora and dropped candidates are in
[`reference/measurements.md`](skills/technical-prose-style/reference/measurements.md).

Part of [kensio.ai](https://github.com/KensioSoftware/kensio.ai). Licensed under the Apache License
2.0. See the [LICENSE](https://github.com/KensioSoftware/kensio.ai/blob/main/LICENSE) in the
repository root.
