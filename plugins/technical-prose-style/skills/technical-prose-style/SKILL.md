---
name: technical-prose-style
description: Write documentation, READMEs, code comments, commit messages, release notes and PR text as plain technical prose, by removing the constructions that make unedited LLM prose tiring to read. It targets significance tails, contrastive definition, negation framing, appositive tails, colon explainers and a vocabulary that keeps renaming the same thing. Ships a script that scores prose against Django, Go, Rust and Python documentation. Use when writing or editing docs, a README, a changelog, a blog post or any prose for human readers, when asked to improve, tighten or rewrite writing, when prose "sounds like AI" or "sounds like Claude", and when reviewing documentation in a pull request.
license: Apache-2.0
metadata:
  version: "1.18.0"
---

# Technical prose style

For anything a human reads: `docs/`, README files, code comments, commit messages, release notes,
issue and pull request text.

## What this is for

Unedited LLM prose is tiring to read. It is usually accurate, and the reader usually knows it was
machine-drafted and minds that far less. What wears them down is the shape of it. One construction
returns over and over. Every fact trails a clause explaining why the fact matters. A fresh synonym
arrives where the previous term would have done.

The goal here is prose that costs the reader less. Concealment is a different aim, and out of scope.
An independent detector still identifies text that follows every rule below as machine-written. Six
rewritten documents were put through one to check. See [Limits](#limits) at the end.

The rules below come from measurement. 192,000 words of LLM-written technical documentation were
compared against 66,000 words of Django, Go, Rust and Python documentation, and only the patterns
where the two differed by a factor of two or more were kept. The six that survived run between 2.3
and 8.3 times the human rate. Everything else tested came in under 1.2 times. Thresholds are set so
that no human document in the corpus fails and every LLM document does.
[references/measurements.md](references/measurements.md) records the method, the thresholds, the
candidates that were tested and dropped, and a dependency-parser study that falsified four more.

Read [What to leave alone](#what-to-leave-alone) before rewriting anything. Several of the usual
style rules make the prose worse, and the measurements show why.

## The target

Write the way Go's package documentation and the Django docs are written.

- One claim per sentence.
- The subject is something the reader can point at, such as a function, a queue, a file or a test.
  Not "what a deterministic assertion wants".
- Present tense, active voice.
- Say what the thing does, then stop. Trust the reader to work out what it means for them.

```
CreateQueue is idempotent. A second request for the same name returns the existing queue's URL
if the attributes match, and fails with QueueNameExists if they differ.
```

Two sentences carrying two facts, with the consequences left to the reader.

## The four sentence patterns

Each one is a sentence shape. A banned word list can be followed perfectly while the prose still
reads as machine-written, because vocabulary bans do not touch any of these.

### 1. Significance tail

A fact, followed by a clause explaining why the fact matters.

Detect: `,\s+so\s+(a|an|the|it|that|this|there|nothing|no|tests?|you|we|they)\b`

The comma is what makes this a tail. `so` without one is usually doing honest work.

This is the model showing its working. State the fact and leave the working out. Where the
consequence genuinely matters, give it its own sentence. Most of the time a reader holding the fact
can derive it.

<!-- prose-check:off -->

> **Before.** The message records the instant it is hidden until, and it becomes receivable again
> once simulated time reaches that instant. Advancing the clock is therefore all a test needs to
> watch an undeleted message come back.

<!-- prose-check:on -->

> **After.** The message records the instant it is hidden until. It becomes receivable again once
> simulated time reaches that instant.

### 2. Contrastive definition

Defining a thing by what it is not, or by the alternative it displaces. This one has two surface
forms, and the checker scores them separately.

Detect (`contrastive-def`): `\b(rather than|instead of)\b`

Detect (`contrastive-coda`): `,\s+not\s+...` running to the end of the sentence

The coda is the commoner of the two, and it separates the corpora more sharply (8.3 times the human
rate, against 6.2 for the two-word forms). It went undetected for four releases because the first
regex only looks for `rather than` and `instead of`. The rule was right and the regex was half the
size of it. Any rule expressed as a pattern is worth checking for that same gap.

Say what the thing does. Reach for a contrast only when the reader is likely to hold the wrong
belief and the correction is the point of the sentence. Where that test passes, the correction has
earned a sentence of its own, and it reads better in one.

<!-- prose-check:off -->

> **Before.** A service is kept as state rather than by a timer, so a test that finishes with a
> service running leaves nothing behind it.

<!-- prose-check:on -->

> **After.** A service is kept as state. Closing the simulated environment stops it.

<!-- prose-check:off -->

> **Before.** Assert behaviour, not call counts.

<!-- prose-check:on -->

> **After.** Assert behaviour. A call count passes when the code calls the right method for the
> wrong reason.

### 3. Negation framing

Sentences built on `nothing`, `is not`, `does not`, `neither`.

Detect: `\b(is not|are not|does not|nothing|neither)\b`

Negation is fine when the absence is the fact being documented, such as a limitation or an
unsupported option. It is a tic when it is a roundabout way of stating something positive. "Nothing
here replaces the process clock" is the same fact as "time belongs to a `SimAws` instance", written
backwards.

<!-- prose-check:off -->

> **Before.** Nothing here replaces the clock for the whole process. Time belongs to a `SimAws`
> instance, so moving it never disturbs another simulation running in the same test file, the real
> clock, or any other code in the process.

<!-- prose-check:on -->

> **After.** Time belongs to a `SimAws` instance. Moving it affects that instance only. The host
> clock and any other simulation in the process carry on unchanged.

Headings take this worst, and they used to escape the checker (it strips headings before counting,
so for four releases nothing scored them). A heading framed by what a section excludes makes the
reader invert it to find out what the section contains. The checker now reports these as advisory,
because two Django headings in the human corpus are legitimately negative and a hard failure would
flag them.

<!-- prose-check:off -->

> **Before.** Get isolation from the data, not from setup and teardown

<!-- prose-check:on -->

> **After.** Take isolation from randomised data

### 4. Appositive tail

A trailing `, which is` / `, which means` clause that comments on the sentence it is attached to.

Detect: `, which (is|means|makes|gives|lets|keeps|does)\b`

The same reflex as the significance tail, wearing a relative pronoun. Either promote the clause to
its own sentence or delete it.

<!-- prose-check:off -->

> **Before.** The schedule has to exist: updating one that is not there is a
> `ResourceNotFoundException` rather than a create, which is another difference from EventBridge's
> `PutRule`.

<!-- prose-check:on -->

> **After.** The schedule has to exist. Updating one that is absent raises
> `ResourceNotFoundException`. EventBridge's `PutRule` creates it.

## Banned marks

Three marks are house rules. The checker fails a file for any occurrence of any of them.

- **Em dashes.** None in prose. In LLM prose written without a ban they run at 1.93 per 1000 words
  against a human 0.24. That ban is earned. Replace with a full stop, a comma, or brackets.
- **Semicolons.** None in prose. This one is consistency and carries no evidence behind it. The
  human corpus uses semicolons more than twice as often as any LLM corpus does. Split the sentence.
- **Mid-sentence colons.** None in prose. This is a house decision taken against the evidence, and
  worth being clear about. A mid-sentence colon is ordinary English, and at zero tolerance every one
  of the 15 human documents in the corpus fails. It is banned anyway, on the same reasoning as the
  em dash. The construction reads as machine-written whoever wrote it, and the cost of doing without
  it is low. A colon **ending a line** to introduce a list, a code block or the next paragraph is
  exempt and always will be. Documentation cannot be written without it. Only the mid-sentence form
  is banned, and the two are distinguished by whether the colon's object is in the same paragraph.

The `- **Term** — description` form in a list is typography, and is exempt.

Closing all three at once is the point. Banning the em dash alone moved the same pattern onto
colons, where nothing was watching for it. A remark with nowhere to hang becomes its own sentence.

## Use brackets

The largest single gap in the whole study. The human corpus uses parenthetical asides at 6.19 per
1000 words, the LLM corpus at 0.15. Forty times.

Brackets are the missing habit here. They are where a subordinate remark should go once the dash and
the colon are gone. A qualification, an aside, a unit or a caveat worth one clause goes in brackets,
the way the Rust Book and the Django docs do on nearly every page.

Nothing in the checker measures this (a rule that rewards padding would be worse than no rule), so
it stays a habit to build by hand. It is the one place where the fix is to add rather than to cut.

## Keep one name for one thing

Human technical writing names a thing and goes on naming it that. LLM prose reaches for a synonym.

Measured as distinct words per 100, averaged across a document, the human corpus sits at 0.628 and
never exceeds 0.664. The LLM corpus sits at 0.685 and never falls below 0.658. That is the cleanest
single separation in the whole study, and it is the one that maps most directly onto reader fatigue.
A new name for an old thing stops the reader to re-resolve what it refers to.

So if the thing is a queue, call it the queue every time. Call it the queue, then the message store,
then the buffer, and the reader pays for each change. The same holds for the identifiers in the code
being documented.

The checker reports this as advisory and never fails a file on it, for two reasons. It scores a
whole document, and there is no line to go and fix. And it is trivially gamed by padding with
repeated words, which would move the number the right way while making the prose worse.

## Short strings are a different genre

Everything above is calibrated on documents of 200 words and more, and the checker refuses to score
anything shorter. A package description, a plugin listing, a meta description or a card subtitle is
a different problem, and the rules above get it wrong in both directions.

Forty descriptions from long-established npm packages (express, lodash, axios, webpack, eslint and
the like) were compared against five written by Claude for this repository:

|                                            | Human npm   | Claude   |
| ------------------------------------------ | ----------- | -------- |
| Median length                              | **7 words** | 38 words |
| Noun phrase followed by a colon and a list | **0 of 40** | 4 of 5   |
| Three-item list                            | 2 of 40     | 5 of 5   |

Nothing in the human set uses the shape. Not one. So for a short listing string:

- **Say what the thing is, in one declarative clause.** "Promise based HTTP client for the browser
  and node.js". "Terminal string styling done right". Seven words is a normal length.
- **No colon followed by a catalogue.** `Thing for X: doing A, doing B, and doing C` is the shape to
  avoid, and it is the shape Claude reaches for every time. The permission for a list-introducing
  colon in the section above applies to prose, and it stops there.
- **No three-item list**, however tempting. The finding that triples are a human marker holds for
  prose inside a document, and it inverts here.
- **Leave out what the thing covers.** The detail belongs in the body, which a listing page renders
  directly underneath. Enumerating in the description says it twice.
- **Avoid coy abstraction.** "The style rules that turn out not to matter" withholds the content and
  gestures at it. Either name the thing or leave it out.

One human description in the forty ran to 37 words. It did it as three separate sentences.

## What to leave alone

These are the measured non-differences. Acting on them costs effort and makes the prose worse.

- **Sentence length.** The LLM corpus averaged 20.9 words per sentence and the human exemplars 19.8.
  Long sentences were equally common in both (10.1% over 32 words against 11.7%). Do not chop
  sentences into fragments for rhythm. The problem is what the clauses are doing, and the count is
  beside the point.
- **Ordinary vocabulary.** The Django and Go docs use `powerful`, `robust`, `simply` and `crucial`
  ten times more often than the LLM corpus did. The signal lives in sentence shape. Cut a
  promotional **claim** where the text is selling instead of explaining, and leave the vocabulary
  alone.
- **The rule of three.** In prose, the human exemplars write "X, Y and Z" nearly twice as often as
  the LLM corpus does. The apparent signal came entirely from lists of API names, which are
  legitimate enumerations. Leave triples alone.
- **Verbless list fragments.** A sentence made of comma-separated noun phrases with no main verb
  ("The same construction over and over, every fact trailed by a clause, a fresh synonym where the
  previous term would have done"). This one feels like a tic and measures at 1.0 times the human
  rate. That is as close to no signal as the study found. Django and the Rust Book write them just
  as often. A pile of them in one document is still worth breaking up, for the repetition and not
  for the shape.
- **Long enumerations.** Four or more comma-separated items in a sentence run at 1.2 times, and five
  or more at 1.4 times. Both sit under the two-times bar.
- **Parataxis.** The exemplars use it seven times more. Comma-spliced and juxtaposed clauses mark
  the human corpus.
- **Trailing participles** (`, leaving nothing behind`, `, making it faster`). A well-known
  suspicion that the measurement does not support. The exemplars use them twice as often.
- **Subordination in general.** Both corpora carry 1.4 clauses per sentence, and trailing
  subordinate clauses separate them by only 1.25×. The tic is the narrow comma-plus-`so` collocation
  on its own.
- **First person and anecdote.** Do not add either while rewriting. Inventing a voice is a different
  failure.

If a passage still reads badly after these patterns are gone, the problem is more likely to be the
order of the material than the sentences.

## Document shape

- No preamble. One sentence saying what the page covers, then the first thing the reader came for.
- Coverage lists ("Available functionality", "What's supported") go at the end, next to Limitations.
  A list that only repeats the headings below it should not be written at all.

## The audit pass

One pass is never enough. The patterns are reflexes, and they reappear in the replacements. Always
run a second pass over what has just been written.

1. Write the prose.
2. Run the checker on the file:

```bash
node scripts/prose-check.mjs path/to/file.md
```

That path is relative to this skill's own directory, wherever the skill was installed. Run it from
there, or prefix it with the directory holding this `SKILL.md`.

The checker strips code blocks, counts each pattern per 1000 words, compares against the exemplar
baseline, and prints the worst sentence for every pattern over threshold. Pass a directory to score
a whole tree, `--json` for machine-readable output, `--examples 5` for more samples.

A page that quotes bad prose deliberately can exclude it with `<!-- prose-check:off -->` and
`<!-- prose-check:on -->`. This file uses those markers around its own **Before** examples. Use them
for quoted material only, and never to silence a passage the checker is right about.

3. Fix what it reports, then run it again. Aim for rates below `warn` on every pattern. Zero is the
   wrong target. `warn` is the 90th percentile of the human corpus and `fail` sits above its
   maximum. A `warn` means "at the top of the human range" and a `FAIL` means "outside it".

Prose that passes the checker can still be bad, and the checker has no opinion about whether the
content is correct or the page is in a sensible order. It catches the reflexes. Judgement is still
required for everything else.

## Limits

It fails to make text pass as human-written, and it should not be sold that way.

Six documents were rewritten to satisfy every rule here and then submitted to Pangram, a commercial
detector. All six were still identified as AI. The mean score moved from 0.87 to 0.79, one document
scored worse after the rewrite, and two were pinned at the maximum in both states. The same detector
scored four human control documents at zero. The instrument was working.

Style and provenance are different signals. The patterns here are real differences between human and
LLM technical writing, and closing them makes prose plainer. A classifier keys on something else.
Anyone who wants concealment is holding the wrong tool, and it is worth saying so plainly to a user
who asks.

## Related skills

[`avoid-ai-writing`](https://github.com/conorbronsdon/avoid-ai-writing) (MIT) catalogues about forty
patterns from a different register. Sycophantic tone, engagement-bait closers, rhetorical-question
openers, hashtag stuffing, chatbot artifacts and hedge stacking all appear in it. Reach for it when
the writing is a blog post, a release announcement, landing page copy or a social post. Once
installed, invoke it as `/avoid-ai-writing:avoid-ai-writing`.

The two overlap very little, and both are worth having for that reason. Its catalogue covers none of
the patterns above, and the corpus measured here scored near zero on its categories before any of
them were applied.

Where they disagree, this skill governs documentation. Its default target for em dashes is zero, and
the measurement here shows that ban moving the pattern onto colons without removing it. Its own
`docs` context profile already relaxes the em dash rule, so run it with that profile on anything
from `docs/`.
