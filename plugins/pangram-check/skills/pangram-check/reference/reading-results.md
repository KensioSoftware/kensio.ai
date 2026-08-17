# Reading a result

Pangram scores the whole submission and then scores it again in windows, so the useful part of a
result is the window list.

## The document level

| Field                      | What it carries                                           |
| -------------------------- | --------------------------------------------------------- |
| `headline`                 | A short verdict, such as `AI Detected` or `Human Written` |
| `prediction`               | A sentence of detail behind the headline                  |
| `prediction_short`         | The same in a word or two                                 |
| `fraction_ai`              | Share of the text scored as machine-written, 0 to 1       |
| `fraction_ai_assisted`     | Share scored as written with machine help                 |
| `fraction_human`           | Share scored as human-written                             |
| `num_ai_segments`          | Count of segments in each class, alongside the two below  |
| `num_ai_assisted_segments` |                                                           |
| `num_human_segments`       |                                                           |
| `version`                  | The detector version behind the verdict                   |

The three fractions and the three segment counts answer different questions. A document can be 20%
AI by volume while only one segment out of nine is the source of it, which points at a passage. The
same 20% spread evenly across every segment points at the whole document.

## The window level

| Field                        | What it carries                                   |
| ---------------------------- | ------------------------------------------------- |
| `ai_assistance_score`        | 0 for human, 1 for machine. The number to sort by |
| `label`                      | `Human`, `AI` or `AI Assisted`                    |
| `confidence`                 | How sure the detector is of that label            |
| `text`                       | The passage that was scored                       |
| `start_index`, `end_index`   | Character offsets into the submitted prose        |
| `word_count`, `token_length` | The size of the window                            |
| `is_humanized`               | The passage looks worked over to read as human    |
| `humanizer_score`            | How strongly, 0 to 1                              |

The script turns `start_index` into a `file:line` reference by mapping it back through the
extraction, so a flagged window points at the paragraph in the source file. Line references are
accurate to the block, and the column is not tracked.

## Which signals to act on

**Sort by `ai_assistance_score` and read the top two or three passages.** Everything else in the
result is context for those.

**`is_humanized` outranks a high score.** A high score says a passage reads as machine-written. The
humanized flag says it reads as machine-written text that has since been edited to look human, which
is a claim about the editing as well as the drafting.

**`confidence` qualifies the label, and it qualifies a low score too.** A `Human` label at low
confidence is a weaker result than a `Human` label at high confidence.

**Short windows are noisier.** A window of 60 words carries less signal than one of 300. Check
`word_count` before acting on an outlier.

## The limits of a verdict

Pangram reports whether text reads as machine-generated. Whether the writing is any good is a
separate question, and a document can come back fully human while being badly organised, wrong, or
dull.

Detectors carry false positives. Published audits have found high false-positive rates on writing by
non-native English speakers, which is the failure mode to hold in mind before treating a score as
evidence about a person. One verdict is one input to a rereading.

Scores also move for reasons that have nothing to do with quality. Quoted material, standard
technical phrasing and heavily edited passages all shift the number. Read the passage the score
points at, and judge the passage.
