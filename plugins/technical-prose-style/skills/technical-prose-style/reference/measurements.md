# Where the rules came from

The measured patterns in `SKILL.md` were selected by comparing human-written and LLM-written
technical documentation and keeping only what separated them. This file records the method, the
numbers, and the candidates that were tested and dropped, so the thresholds can be argued with and
the study can be re-run.

## The corpora

**Human exemplars.** 65,767 words across 15 documents from four independent sources. Four Django
documentation topics (`db/queries`, `http/urls`, `testing/overview`, `cache`), Effective Go, six
chapters of the Rust Book, and four Python documentation pages. All four are long-lived technical
documentation for developer audiences, written and revised by many hands, and all four predate
widespread LLM drafting.

**LLM corpora.** 192,430 words across 60 documents from three independent sources. The `docs/` tree
of a TypeScript library, the architecture READMEs under its `src/` tree, and the skills in a
separate repository. Different projects, different genres, one author model.

It matters that the first LLM corpus was written under a style guide already. That guide banned em
dashes, marketing language, the rule of three, preambles and long sentences. The guide was followed.
Em dashes fell to 0.33 per 1000 words and promotional vocabulary almost disappeared. The prose still
read as machine-written. That is the observation that started this.

Code blocks, inline code, headings, tables, link targets and URLs were stripped from both before
counting. Hard-wrapped lines were rejoined into paragraphs first, so sentence boundaries survive.

**The 2026 re-measurement.** `contrastive-coda` and the heading finding below come from a later run
against a freshly fetched corpus, because the original working files were never committed. That run
used 19 human documents (85,557 words) from the same four sources, and 13 LLM documents (15,022
words) from this repository. It reproduced the published `contrastive-def` rate to two decimal
places (1.05 against 1.06) and put `significance-tail` at 0.60 against the published 0.79, close
enough on a different document selection to treat the two runs as comparable. The LLM side of that
run is the weaker half. Every document in it had already been rewritten under the rules in
`SKILL.md`, so its rates show what survives the style guide. An unguided draft would score higher.

## Patterns kept

| Pattern           | Human /1k | LLM /1k | Ratio |
| ----------------- | --------- | ------- | ----- |
| significance-tail | 0.79      | 6.41    | 8.1×  |
| contrastive-coda  | 0.30      | 2.53    | 8.3×  |
| contrastive-def   | 1.06      | 6.62    | 6.2×  |
| negation-frame    | 2.04      | 10.50   | 5.2×  |
| appositive-tail   | 0.59      | 3.15    | 5.3×  |
| colon-explainer   | 2.05      | 4.74    | 2.3×  |

`contrastive-coda` is the `X, not Y` form of contrastive definition, and it was missed for four
releases. The rule in `SKILL.md` always described both forms, and the regex only ever matched
`rather than` and `instead of`. Measured on prose that had already been rewritten to satisfy that
regex, the coda still ran at 8.3 times the human rate. That is the sharpest separation in the study.
The construction was moving to the undetected form, in the same way that banning the em dash moved
it onto colons.

Only the `not` form is detected. The `, no ...` variant was tested and dropped, because both of its
human-corpus hits were ordinary clauses (", no problem." and ", no result is displayed before the
next interactive prompt.") and it added 4 LLM hits against 2 human false positives.

## How the thresholds were set

Rates are noisy per file, so thresholds come from the distribution and never from the aggregate. For
each pattern, `fail` is the lowest value that flags **none** of the 15 human documents, and `warn`
is the 90th percentile of those documents. Banned marks are the exception, described below.

| Pattern           | Baseline | Warn (human p90) | Fail (zero human hits) | LLM files caught |
| ----------------- | -------- | ---------------- | ---------------------- | ---------------- |
| significance-tail | 0.79     | 1.7              | 2.3                    | 93%              |
| contrastive-coda  | 0.30     | 0.85             | 1.6                    | 54%              |
| contrastive-def   | 1.06     | 2.3              | 4.0                    | 81%              |
| negation-frame    | 2.04     | 4.6              | 5.0                    | 86%              |
| appositive-tail   | 0.59     | 1.1              | 1.8                    | 81%              |
| colon-explainer   | 2.05     | 2.0              | 3.0                    | 77%              |

The `contrastive-coda` row follows the same rule as the others. Its human maximum is 1.51 per 1000
words (a Python tutorial page on exceptions) and its 90th percentile is 0.83, so `fail` sits at 1.6
and `warn` at 0.85. At 1.6 it flags 0 of the 19 human documents and 7 of the 13 LLM ones. That 54%
is the lowest catch rate of the six, and it is measured against already-rewritten prose, so treat it
as a floor.

At the file level, where a document fails if any single pattern fails, the measured patterns at
their zero-false-positive settings flag **0% of the human documents and 100% of the LLM documents**.

Two later decisions trade some of that away deliberately, and both are house style rather than
evidence:

| Configuration                                   | Human documents flagged | LLM documents flagged |
| ----------------------------------------------- | ----------------------- | --------------------- |
| Measured patterns, zero-false-positive settings | 0 of 15                 | 100%                  |
| With colon-explainer tightened to 3.0           | 3 of 15                 | 94%                   |
| With the em dash and semicolon bans             | 15 of 15                | 100%                  |

The bans flag every human document by construction, because Django, the Rust Book and the Python
docs all use em dashes and semicolons freely. A run with `--no-bans` drops them and re-checks the
measured separation, which is how the numbers above stay verifiable.

The first calibration used only Django and Effective Go, and set `fail` at three times the mean.
Once the human corpus was widened that flagged 3 of the 15 human documents, including a Rust Book
chapter whose subject is contrasting two representations. A style checker that fires on the Rust
Book is wrong, so the thresholds moved to the rule above.

Colon-explainer is the one place the zero-false-positive rule was overridden deliberately. At a
threshold no human document trips (6.6) it caught only 27% of LLM documents. It is set to 3.0
instead, as a house decision to suppress the construction. That costs 3 of the 15 human documents,
all of them Python pages, which lean on the "term, then explanation" form. The cost is known and
accepted.

## Banned marks

Three marks are house rules with no measured threshold behind them. Any occurrence in prose fails.

| Mark               | Human /1k | LLM /1k, unbanned | Note                                        |
| ------------------ | --------- | ----------------- | ------------------------------------------- |
| Em dash            | 0.24      | 1.93              | 8× the human rate where no ban was in force |
| Semicolon          | 2.70      | 1.04              | The human corpus uses these 2.6× more       |
| Mid-sentence colon | 1.49      | 4.00              | Banned by house decision, see below         |

The em dash number corrects an earlier reading. Measured only against the corpus that already banned
em dashes, the mark looked innocent at 0.33 per 1000 words. Measured against LLM prose written
without that ban, it runs at 1.93 against a human 0.24. The first measurement was recording
compliance with the ban and never the underlying habit. Banning it is justified.

Semicolons are the opposite case. The human corpus uses them more than twice as often as any LLM
corpus does. The ban removes almost nothing, and moves the prose slightly toward the machine end of
the range. It is in place as a house consistency rule and never as a tic detector.

Colons are now banned outright, and that is a house decision taken against the evidence rather than
from it. At zero tolerance every one of the 15 human documents fails, because a mid-sentence colon
is ordinary English. The reasoning is the same as for the em dash. The construction reads as
machine-written whoever wrote it, and prose costs little by doing without it. Anyone recalibrating
this study should treat the colon threshold as a preference and the other four as measurements.

A colon ending a line, introducing a list, a code block or the next paragraph, is exempt and stays
exempt. The human corpus uses that form 4.56 per 1000 words against the LLM corpus's 1.99, and
documentation cannot be written without it. `toProse` closes a block that ends in a colon so that
joining paragraphs cannot manufacture a mid-sentence one that nobody wrote.

## Headings

Headings are stripped before counting, on the grounds that they are labels rather than prose. That
left them unscored for four releases, and it turned out to be where negation framing collects.

| Corpus | Headings | Negation-framed | Share    |
| ------ | -------- | --------------- | -------- |
| Human  | 437      | 2               | 0.5%     |
| LLM    | 128      | 8               | **6.3%** |

Half of the LLM hits are the `X, not Y` coda in a heading ("Match service errors by name, not
instanceof"), so the two findings in this section are one habit surfacing in two places.

The two human hits are Django headings documenting a genuine prohibition ("When QuerySets are not
cached" and "Field name hiding is not permitted"), and a heading like that is doing its job. A hard
failure would flag them, so `heading-frame` reports every occurrence and never fails a file. It is
the one check that lists all of its hits, because there are only ever a handful and each one is a
line to go and fix.

## Where the construction goes next

Banning one mark moves the construction to the next available one. That is what happened when em
dashes were banned and colons absorbed the traffic. With all three marks closed, the remaining exits
worth watching are bracketed asides and comma splices.

| Mark                | Human /1k | LLM /1k |
| ------------------- | --------- | ------- |
| Parenthetical aside | 6.19      | 0.15    |

That gap is the largest in the whole study. The human corpus uses bracketed asides 40 times more
often than the LLM corpus does. Brackets are not a tic to watch for. They are the missing habit, and
the natural home for a remark that no longer has a dash or a colon to hang from.

A pattern needs at least three occurrences in a file of at least 200 words before it is flagged. A
rate computed from a single hit says more about the length of the page than about the prose.

## Does it generalise

The first version of this study used one human source pair and one LLM corpus, which is enough to
find a pattern and not enough to trust it. Both sides were then widened to independent sources the
thresholds had never seen.

| Corpus                                               | Words   | Files over a fail threshold |
| ---------------------------------------------------- | ------- | --------------------------- |
| Django docs, human                                   | 17,244  | 0 of 4                      |
| Effective Go, human                                  | 12,623  | 0 of 1                      |
| Rust Book, human, unseen                             | 15,430  | 0 of 6                      |
| Python docs, human, unseen                           | 20,470  | 0 of 4                      |
| Library `docs/` tree, LLM                            | 108,000 | 29 of 31                    |
| Architecture READMEs, LLM, different genre           | 78,000  | 23 of 23                    |
| Skills in another repository, LLM, different project | 6,200   | 5 of 6                      |

Every pattern held its direction and rough magnitude across all of them. The rules are not an
artefact of one project's house style.

## Patterns tested and dropped

Each of these is a common style-guide rule. None of them separated the corpora.

| Candidate                                                                             | Human      | LLM        | Verdict                  |
| ------------------------------------------------------------------------------------- | ---------- | ---------- | ------------------------ |
| Mean sentence length                                                                  | 19.8 words | 20.9 words | 1.06×, no signal         |
| Sentences over 32 words                                                               | 11.7%      | 10.1%      | LLM writes fewer         |
| AI vocabulary (`delve`, `robust`, `seamless`, `powerful`, `crucial`, `leverage`, ...) | 0.80 /1k   | 0.08 /1k   | LLM scores 10× lower     |
| Gerund-led sentences                                                                  | 2.36 /1k   | 2.71 /1k   | 1.15×, no signal         |
| Rule of three, prose only (code spans excluded)                                       | 0.63 /1k   | 0.34 /1k   | LLM writes half as many  |
| Trailing participles (`, leaving X`, `, making Y`)                                    | 0.30 /1k   | 0.14 /1k   | LLM writes half as many  |
| Verbless list fragment (noun phrases, no main verb)                                   | 2.52 /1k   | 2.53 /1k   | 1.00×, no signal         |
| Enumeration, four or more comma-separated items                                       | 3.71 /1k   | 4.46 /1k   | 1.2×, under the bar      |
| Enumeration, five or more                                                             | 1.22 /1k   | 1.66 /1k   | 1.4×, under the bar      |
| `, no ...` coda (as against `, not ...`)                                              | 0.02 /1k   | 0.27 /1k   | 2 human hits, both wrong |

The vocabulary result is the one worth dwelling on. Django and Effective Go use the words on every
AI-detector word list ten times more often than the Claude-written corpus does, because those words
are ordinary English and the corpus had been told to avoid them. A word list is measuring compliance
with a word list.

Sentence length is the same story from the other side. "Break up long sentences" was in the style
guide, the corpus obeyed it, and the result was the same clause count packed into shorter sentences
joined by colons.

The verbless list fragment is the most surprising of the drops, and it was tested because a reader
of this repository flagged it as the thing that grated most. It measures at 1.00×. Django and the
Rust Book build sentences out of bare noun phrases exactly as often as the LLM corpus does. The
dependency-parser study had already found this from the other direction, with the `appos` relation
at 0.79× in favour of the human corpus. What makes a pile of them grate is repetition inside one
document, and every measure in this study is a rate per 1000 words, and that is blind to whether six
hits are spread through a page or stacked in one paragraph. A measure of within-document shape
repetition would be the honest way to catch it, and none of the shipped rules is one.

## The dependency-parser study

Regexes cannot see grammar, so both corpora were re-measured with a spaCy dependency parse
(`en_core_web_sm`) to test whether syntactic features detect the tics more accurately.

| Parser feature                            | Human /1k | LLM /1k | Ratio |
| ----------------------------------------- | --------- | ------- | ----- |
| Coordination arity 3+ (rule of three)     | 0.78      | 1.89    | 2.4×  |
| `parataxis` relation                      | 0.49      | 0.07    | 0.14× |
| Trailing subordinate clause               | 20.41     | 25.48   | 1.25× |
| Trailing subordinate clause after a comma | 4.28      | 9.49    | 2.2×  |
| `appos` relation                          | 8.62      | 6.79    | 0.79× |
| Clauses per sentence                      | 1.42      | 1.37    | 0.96× |

Then the two features that separated the corpora were re-tested as plain regexes, to see what the
parse was buying:

| Feature              | Parse ratio | Regex ratio                                    |
| -------------------- | ----------- | ---------------------------------------------- |
| Comma-plus-`so` tail | 2.2×        | **8.2×**                                       |
| Rule of three        | 2.4×        | 2.6×, then 0.54× once code lists were excluded |

The regex wins, and the reason generalises. A parser recognises a whole grammatical class, and that
class contains all the legitimate uses along with the tic. Trailing subordinate clauses are ordinary
English at 1.25×. The tic is one narrow collocation inside that class, and grammatical generality
dilutes it. Adding a parser made detection worse.

The parse earned its cost as a research instrument. It falsified four candidate rules that sound
right, including two that had been written into a style guide. Use it to find and kill candidates,
then ship regexes.

Two traps it exposed, both worth repeating:

- **Dialect masquerading as a tic.** "X, Y and Z" without the Oxford comma separates the corpora at
  4.7×. The exemplars are American and take the Oxford comma. The LLM corpus was written in British
  English. That measurement detects nationality.
- **Markup masquerading as prose.** Rule of three separates at 2.6× until code spans are excluded,
  at which point it inverts to 0.54×. The whole signal was lists of API names.

## The Pangram study

The patterns were selected, calibrated and enforced using measurements that all came from the same
hand. Pangram is a commercial AI-text detector, and it had no part in defining any rule, so it was
used as an outside judge of whether the rewriting achieves anything.

**Instrument check.** Four human documents (Django, two Rust Book chapters, a Python tutorial page)
scored `fraction_ai` of 0.00 and came back "Human Written". No false positives on this genre, so its
verdicts here can be relied on.

**Treatment.** Six documents in this repository were scored before and after being rewritten to
satisfy every rule above.

| Document                      | Before   | After    |
| ----------------------------- | -------- | -------- |
| isolated-testing-style SKILL  | 0.87     | 0.48     |
| yulin-aws-simulation SKILL    | 1.00     | 0.82     |
| root README                   | 0.65     | 0.46     |
| isolated-testing-style README | 1.00     | 1.00     |
| part-factory SKILL            | 1.00     | 1.00     |
| yulin-aws-simulation README   | 0.68     | 1.00     |
| **Mean**                      | **0.87** | **0.79** |

All six were still identified as AI after the rewrite. One scored worse. Edit volume failed to
predict the change. The document with the most edits improved by 0.18, and the one with the fewest
stayed where it was.

The conclusion is that style and provenance are different signals. The patterns are real differences
between human and LLM technical writing, and a classifier keys on something else. `SKILL.md` says
so, under "Limits".

One reassuring result. No window in any group was flagged `is_humanized`. The rewriting is not
producing evasion artefacts, largely because it moves the score so little.

## What the Pangram study did find

Pangram scores windows of roughly 300 words, which gave 109 windows across the four groups. Features
were computed per window and correlated with the window score.

| Feature                       | Human | LLM   | r with score |
| ----------------------------- | ----- | ----- | ------------ |
| Distinct words per 100        | 0.627 | 0.699 | **0.51**     |
| Parenthetical asides per 1000 | 5.90  | 0.99  | -0.26        |
| The five patterns per 1000    | 6.24  | 20.46 | 0.16         |
| Sentence length variance      | 10.30 | 9.42  | -0.23        |
| Mean sentence length          | 19.44 | 18.36 | -0.18        |

Lexical spread is the strongest correlate by some distance, and it holds up when length is
controlled, which matters because raw type-token ratio falls as text gets longer (r of -0.73 against
window length here). Measuring fixed 100-word chunks removes that.

Scored over whole documents with the shipped extraction, 15 human documents average 0.628 and none
exceeds 0.664, while 55 LLM documents average 0.685 and none falls below 0.658. The distributions
barely touch.

A second measure supports the reading. Taking the ten most frequent content words in a document, the
human corpus gives them 23.9% of all content tokens against 19.4%, 18.3% and 14.9% for the three LLM
corpora. Human technical writing concentrates on a small set of terms and repeats them. The Rust
ownership chapter leans on data, string, heap, memory and stack. That is terminology discipline, and
it is why the rule is worded as one name for one thing and never as a target number.

It ships as advisory. It describes a whole document and points at no line to fix, and padding with
repeated words would move it the right way while making the prose worse.

## Re-running the study

The point of a measured style guide is that it can be re-measured. To recalibrate against a
different exemplar corpus, or to check whether a new candidate pattern earns its place:

1. Collect exemplar prose in markdown, or adapt the stripping in `prose-check.mjs` for the format.
   Prefer documents written before 2022, since anything newer may itself be LLM-drafted.
2. Score both corpora with `--json`. Report the aggregate ratio by total words, and keep the
   per-file rates for step 4.
3. Keep a candidate only where the aggregate ratio clears 2×.
4. Set `fail` to the lowest value that flags no human document, and `warn` to the human 90th
   percentile. Report what fraction of LLM documents that catches. A threshold below the human
   maximum is a bug, however good the aggregate ratio looks.
5. Use at least three independent sources on each side. Two sources cannot tell a real pattern from
   a house style.

A pattern that fires on prose you consider good is a bad pattern, however plausible the rule behind
it sounds. Every dropped candidate above sounded plausible, and two of them were already being
enforced as style rules.

## On distilling from a rewriting tool

Feeding bad passages through a third-party rewriter and mining the diffs is a reasonable way to
generate candidate patterns. It is a poor way to decide which ones to keep, because the tool's own
preferences arrive along with the improvements, and there is no way to tell one from the other. The
measurement above is the filter. Generate candidates however you like, then keep the ones that
separate real human prose from your own output.
