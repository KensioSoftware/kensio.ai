---
name: technical-prose-style
description: Write documentation, READMEs, code comments, commit messages, release notes and PR text as plain technical prose, by removing the constructions that make unedited LLM prose tiring to read. Significance tails, contrastive definition, negation framing, appositive tails, colon explainers, and a vocabulary that keeps renaming the same thing. Ships a script that scores prose against Django, Go, Rust and Python documentation. Use when writing or editing docs, a README, a changelog, a blog post or any prose for human readers, when asked to improve, tighten or rewrite writing, when prose "sounds like AI" or "sounds like Claude", and when reviewing documentation in a pull request.
---

# Technical prose style

For anything a human reads: `docs/`, README files, code comments, commit messages, release notes,
issue and pull request text.

## What this is for

Unedited LLM prose is tiring to read. It is usually accurate, and the reader usually knows it was
machine-drafted and minds that far less. What wears them down is the shape of it. The same
construction over and over, every fact trailed by a clause explaining why the fact matters, a fresh
synonym where the previous term would have done.

The goal here is prose that costs the reader less. Concealment is a different aim, and out of scope.
An independent detector still identifies text that follows every rule below as machine-written,
which was tested rather than assumed. See "What this does not do" at the end.

The five rules below were chosen by measurement, not by taste. 192,000 words of LLM-written
technical documentation were compared against 66,000 words of Django, Go, Rust and Python
documentation, and only the patterns where the two differed by a factor of two or more were kept.
The five that survived run between 2.3 and 8.1 times the human rate. Everything else tested came in
under 1.2 times. Thresholds are set so that no human document in the corpus fails and every LLM
document does. [reference/measurements.md](reference/measurements.md) has the numbers, the method,
the patterns that were tested and dropped, and a dependency-parser study that falsified four more.

Read [What not to change](#what-not-to-change) before rewriting anything. Several of the usual style
rules make the prose worse, and the measurements show why.

## The target

Write the way Go's package documentation and the Django docs are written.

- One claim per sentence.
- The subject is something the reader can point at: a function, a queue, a file, a test. Not "what a
  deterministic assertion wants".
- Present tense, active voice.
- Say what the thing does, then stop. Trust the reader to work out what it means for them.

```
CreateQueue is idempotent. A second request for the same name returns the existing queue's URL
if the attributes match, and fails with QueueNameExists if they differ. A request naming no
attributes always matches.
```

Three sentences, three facts, no commentary on any of them.

## The five patterns

Each one is a sentence shape, not a word. Vocabulary bans do not touch them, which is why a banned
word list can be followed perfectly and the prose still reads as machine-written.

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

Defining a thing by what it is not, or by the alternative it displaces.

Detect: `\b(rather than|instead of)\b`

Say what the thing does. Reach for a contrast only when the reader is likely to hold the wrong
belief and the correction is the point of the sentence.

<!-- prose-check:off -->

> **Before.** A service is kept as state rather than by a timer, so a test that finishes with a
> service running leaves nothing behind it.

<!-- prose-check:on -->

> **After.** A service is kept as state. Closing the simulated environment stops it.

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

### 5. Colon explainer

A colon joining a claim to its own restatement or justification.

Detect: `[a-z,] ?: [a-z]`

A colon introducing a list, a definition, or a term is fine. A colon introducing a second version of
the sentence just before it is the em dash habit wearing different punctuation. Banning the em dash
moved this construction onto colons without removing any of it.

<!-- prose-check:off -->

> **Before.** The properties with behaviour that is not simulated are a different case: the queue is
> created without them and each one is recorded in `propertiesNotApplied`, so a stack full of queues
> still deploys.

<!-- prose-check:on -->

> **After.** Properties whose behaviour is not simulated are handled differently. The queue is
> created without them, and each one is recorded in `propertiesNotApplied`. The stack still deploys.

## Banned marks

Three marks are house rules. The checker fails a file for any occurrence of the first two.

- **Em dashes.** None in prose. In LLM prose written without a ban they run at 1.93 per 1000 words
  against a human 0.24, so this one is earned. Replace with a full stop, a comma, or brackets.
- **Semicolons.** None in prose. This one is consistency rather than evidence. The human corpus uses
  semicolons more than twice as often as any LLM corpus does. Split the sentence instead.
- **Mid-sentence colons.** Rate-limited, not banned, because a mid-sentence colon is ordinary
  English and zero tolerance fails every human document in the corpus. A colon that ends a line to
  introduce a list or a code block is exempt.

The `- **Term** — description` form in a list is typography, not prose, and is exempt.

Closing all three at once is the point. Banning the em dash alone moved the same construction onto
colons, where nothing was watching for it. A remark with nowhere to hang becomes its own sentence.

## Use brackets

The largest single gap in the whole study. The human corpus uses parenthetical asides at 6.19 per
1000 words, the LLM corpus at 0.15. Forty times.

So brackets are the missing habit here, not a tic to avoid. They are and they are where a
subordinate remark should go once the dash and the colon are gone. A qualification, an aside, a
unit, a caveat worth one clause and not one sentence goes in brackets, the way the Rust Book and the
Django docs do on nearly every page.

## Keep one name for one thing

Human technical writing names a thing and goes on naming it that. LLM prose reaches for a synonym.

Measured as distinct words per 100, averaged across a document, the human corpus sits at 0.628 and
never exceeds 0.664. The LLM corpus sits at 0.685 and never falls below 0.658. That is the cleanest
single separation in the whole study, and it is the one that maps most directly onto reader fatigue.
A new name for an old thing stops the reader to re-resolve what it refers to.

So if the thing is a queue, call it the queue every time. Not the queue, then the message store,
then the buffer. The same holds for the identifiers in the code being documented.

The checker reports this as advisory and never fails a file on it, for two reasons. It describes a
whole document rather than a defect at a point, so there is no line to go and fix. And it is
trivially gamed by padding with repeated words, which would move the number the right way while
making the prose worse.

## What not to change

These are the measured non-differences. Acting on them costs effort and makes the prose worse.

- **Sentence length.** The LLM corpus averaged 20.9 words per sentence, the human exemplars 19.8.
  Long sentences were equally common in both (10.1% over 32 words against 11.7%). Do not chop
  sentences into fragments for rhythm. The problem is what the clauses are doing, not how many there
  are.
- **Ordinary vocabulary.** The Django and Go docs use `powerful`, `robust`, `simply` and `crucial`
  ten times more often than the LLM corpus did. The signal lives in sentence shape. Cut a
  promotional **claim** where the text is selling rather than explaining, and leave the vocabulary
  alone.
- **The rule of three.** In prose, the human exemplars write "X, Y and Z" nearly twice as often as
  the LLM corpus does. The apparent signal came entirely from lists of API names, which are
  legitimate enumerations. Leave triples alone.
- **Parataxis.** The exemplars use it seven times more. Comma-spliced and juxtaposed clauses are a
  mark of the human corpus, not the machine one.
- **Trailing participles** (`, leaving nothing behind`, `, making it faster`). A well-known
  suspicion that the measurement does not support. The exemplars use them twice as often.
- **Subordination in general.** Both corpora carry 1.4 clauses per sentence, and trailing
  subordinate clauses separate them by only 1.25×. The tic is the narrow comma-plus-`so`
  collocation, not subordination.
- **First person and anecdote.** Do not add either while rewriting. Inventing a voice is a different
  failure, not a fix for this one.

If a passage still reads badly after the five patterns are gone, the problem is more likely to be
the order of the material than the sentences.

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
node skills/technical-prose-style/scripts/prose-check.mjs path/to/file.md
```

The script strips code blocks, counts each pattern per 1000 words, compares against the exemplar
baseline, and prints the worst sentence for every pattern over threshold. Pass a directory to score
a whole tree, `--json` for machine-readable output, `--examples 5` for more samples.

A page that quotes bad prose deliberately can exclude it with `<!-- prose-check:off -->` and
`<!-- prose-check:on -->`. This file uses those markers around its own **Before** examples. Use them
for quoted material only, never to silence a passage the checker is right about.

3. Fix what it reports, then run it again. Rates below `warn` for all five patterns is the target,
   not zero. `warn` is the 90th percentile of the human corpus and `fail` is set above its maximum,
   so a `warn` means "at the top of the human range" and a `FAIL` means "outside it".

Prose that passes the script can still be bad, and the script has no opinion about whether the
content is correct or the page is in a sensible order. It catches the reflexes. Judgement is still
required for everything else.

## What this does not do

It fails to make text pass as human-written, and it should not be sold that way.

Six documents were rewritten to satisfy every rule here and then submitted to Pangram, a commercial
detector. All six were still identified as AI. The mean score moved from 0.87 to 0.79, one document
scored worse after the rewrite, and two were pinned at the maximum in both states. The same detector
scored four human control documents at zero, so the instrument was working.

Style and provenance are different signals. The patterns here are real differences between human and
LLM technical writing, and closing them makes prose plainer. A classifier keys on something else.
Anyone who wants concealment is holding the wrong tool, and it is worth saying so plainly to a user
who asks.

## Related skills

[`avoid-ai-writing`](https://github.com/conorbronsdon/avoid-ai-writing) (MIT) catalogues about forty
patterns from a different register. Sycophantic tone, engagement-bait closers, rhetorical-question
openers, hashtag stuffing, chatbot artifacts, hedge stacking. Reach for it when the writing is a
blog post, a release announcement, landing page copy or a social post. Once installed, invoke it as
`/avoid-ai-writing:avoid-ai-writing`.

The two overlap very little, which is why both are worth having. Its catalogue covers none of the
five patterns above, and the corpus measured here scored near zero on its categories before any of
them were applied.

Where they disagree, this skill governs documentation. Its default target for em dashes is zero, and
the measurement here shows that ban moving the construction onto colons instead of removing it. Its
own `docs` context profile already relaxes the em dash rule, so run it with that profile on anything
from `docs/`.
